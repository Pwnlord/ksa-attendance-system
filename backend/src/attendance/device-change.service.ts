import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database, DatabaseClient } from "../database/database.module";
import {
  attendanceDevices,
  deviceChangeRequests,
  identificationPhotos,
  roleAssignments,
  users,
} from "../database/schema";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../identity/audit.service";
import { IdentityService } from "../identity/identity.service";
import { PhotoService } from "../identity/photo.service";
import { DeviceCredentialService } from "../security/attendance-device/device-credential.service";
import { DeviceChangeRequestDto } from "./dto/review.dto";

type DeviceRequest = typeof deviceChangeRequests.$inferSelect;
type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";

function validIdempotencyKey(value: string): void {
  const key = value.trim();
  if (key.length < 16 || key.length > 200) {
    throw new AppError("VALIDATION_ERROR", 400, "Provide a valid Idempotency-Key header.");
  }
}

@Injectable()
export class DeviceChangeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly devices: DeviceCredentialService,
    private readonly identity: IdentityService,
    private readonly photos: PhotoService,
    private readonly audit: AuditService,
  ) {}

  async status(userId: string, deviceToken: string | undefined) {
    await this.assertParticipant(userId);
    const browserStatus = await this.devices.browserStatus(userId, deviceToken);
    const [active] = await this.db
      .select({ approvedAt: attendanceDevices.approvedAt })
      .from(attendanceDevices)
      .where(
        and(
          eq(attendanceDevices.userId, userId),
          eq(attendanceDevices.status, "ACTIVE"),
          isNull(attendanceDevices.revokedAt),
        ),
      )
      .limit(1);
    const [pending] = await this.db
      .select()
      .from(deviceChangeRequests)
      .where(
        and(eq(deviceChangeRequests.userId, userId), eq(deviceChangeRequests.status, "PENDING")),
      )
      .orderBy(desc(deviceChangeRequests.createdAt))
      .limit(1);
    return {
      browserStatus,
      activeDeviceApprovedAt: active?.approvedAt?.toISOString() ?? null,
      pendingRequest: pending ? await this.toResponse(pending, false) : null,
    };
  }

  async listOwn(userId: string) {
    await this.assertParticipant(userId);
    const requests = await this.db
      .select()
      .from(deviceChangeRequests)
      .where(eq(deviceChangeRequests.userId, userId))
      .orderBy(desc(deviceChangeRequests.createdAt));
    return { items: await Promise.all(requests.map((request) => this.toResponse(request, false))) };
  }

  async createWithCredential(
    userId: string,
    deviceToken: string | undefined,
    context: { userAgent?: string },
    response: import("express").Response,
    input: DeviceChangeRequestDto,
    correlationId?: string,
  ) {
    await this.assertParticipant(userId);
    const tokenOwner = await this.devices.findByToken(deviceToken);
    if (tokenOwner && tokenOwner.userId !== userId) {
      throw new AppError(
        "CONFLICT",
        409,
        "This browser is already registered to another attendance account.",
      );
    }
    if (tokenOwner?.userId === userId && tokenOwner.status === "ACTIVE") {
      throw new AppError("CONFLICT", 409, "This browser is already approved for attendance.");
    }
    const result = await this.db.transaction(async (tx) => {
      const [pending] = await tx
        .select()
        .from(deviceChangeRequests)
        .where(
          and(eq(deviceChangeRequests.userId, userId), eq(deviceChangeRequests.status, "PENDING")),
        )
        .orderBy(desc(deviceChangeRequests.createdAt))
        .limit(1);
      if (pending) return { request: pending, candidate: null };
      const candidate = await this.devices.createCandidateRecord(tx, userId, context);
      const [request] = await tx
        .insert(deviceChangeRequests)
        .values({
          userId,
          candidateDeviceId: candidate.id,
          requestReason: input.note?.trim() || null,
          version: 1,
        })
        .onConflictDoNothing()
        .returning();
      if (!request)
        throw new AppError("CONFLICT", 409, "A device-change request is already awaiting review.");
      await this.audit.recordWith(tx, {
        actorUserId: userId,
        actorRole: "PARTICIPANT",
        action: "DEVICE_REPLACEMENT_REQUESTED",
        targetType: "DEVICE_CHANGE_REQUEST",
        targetId: request.id,
        reason: input.note,
        correlationId,
        afterValue: { status: "PENDING" },
      });
      return { request, candidate };
    });
    if (result.candidate) this.devices.bindCreatedDevice(response, result.candidate);
    return {
      created: Boolean(result.candidate),
      data: await this.toResponse(result.request, false),
    };
  }

  async listOperator(actorRoles: string[], status?: RequestStatus, limit = 50) {
    const visibleStatus = actorRoles.includes("ADMIN") ? status : "PENDING";
    const requests = await this.db
      .select()
      .from(deviceChangeRequests)
      .where(
        visibleStatus
          ? eq(deviceChangeRequests.status, visibleStatus)
          : eq(deviceChangeRequests.status, "PENDING"),
      )
      .orderBy(desc(deviceChangeRequests.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return {
      items: await Promise.all(requests.map((request) => this.toResponse(request, false))),
      nextCursor: null,
    };
  }

  async detail(requestId: string, actorId: string, actorRoles: string[]) {
    const request = await this.find(requestId);
    await this.assertCanView(request, actorId, actorRoles);
    return { data: await this.toResponse(request, true) };
  }

  async decide(
    requestId: string,
    actorId: string,
    actorRoles: string[],
    expectedVersion: number,
    reason: string,
    approve: boolean,
    correlationId?: string,
    idempotencyKey?: string,
  ) {
    if (approve) validIdempotencyKey(idempotencyKey ?? "");
    const result = await this.db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(deviceChangeRequests)
        .where(eq(deviceChangeRequests.id, requestId))
        .for("update")
        .limit(1);
      if (!request)
        throw new AppError("NOT_FOUND", 404, "The device-change request was not found.");
      this.assertCanDecide(request, actorId, actorRoles);
      if (request.status !== "PENDING") return request;
      if (request.version !== expectedVersion) {
        throw new AppError(
          "STALE_STATE",
          409,
          "This device-change request changed. Refresh and try again.",
        );
      }
      const [candidate] = await tx
        .select()
        .from(attendanceDevices)
        .where(
          and(
            eq(attendanceDevices.id, request.candidateDeviceId),
            eq(attendanceDevices.userId, request.userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!candidate) throw new AppError("NOT_FOUND", 404, "The device candidate was not found.");
      const now = new Date();
      if (approve) {
        if (actorRoles.includes("COURSE_REP") && !actorRoles.includes("ADMIN")) {
          await this.assertReviewPhotoAvailable(tx, request.userId);
        }
        if (candidate.status === "ACTIVE" && candidate.revokedAt === null) {
          throw new AppError("CONFLICT", 409, "This candidate device is already active.");
        }
        await tx
          .update(attendanceDevices)
          .set({ status: "REVOKED", revokedAt: now })
          .where(
            and(
              eq(attendanceDevices.userId, request.userId),
              eq(attendanceDevices.status, "ACTIVE"),
              isNull(attendanceDevices.revokedAt),
            ),
          );
        await tx
          .update(attendanceDevices)
          .set({ status: "ACTIVE", approvedAt: now, revokedAt: null, lastSeenAt: now })
          .where(eq(attendanceDevices.id, candidate.id));
      } else {
        await tx
          .update(attendanceDevices)
          .set({ status: "REVOKED", revokedAt: now })
          .where(eq(attendanceDevices.id, candidate.id));
      }
      const [updated] = await tx
        .update(deviceChangeRequests)
        .set({
          status: approve ? "APPROVED" : "REJECTED",
          reviewerUserId: actorId,
          decisionReason: reason,
          decidedAt: now,
          version: sql`${deviceChangeRequests.version} + 1`,
        })
        .where(
          and(
            eq(deviceChangeRequests.id, requestId),
            eq(deviceChangeRequests.status, "PENDING"),
            eq(deviceChangeRequests.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated)
        throw new AppError(
          "STALE_STATE",
          409,
          "This device-change request changed. Refresh and try again.",
        );
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: this.actorRole(actorRoles),
        action: approve ? "DEVICE_REPLACEMENT_APPROVED" : "DEVICE_REPLACEMENT_REJECTED",
        targetType: "DEVICE_CHANGE_REQUEST",
        targetId: requestId,
        reason,
        correlationId,
        beforeValue: { status: "PENDING", version: expectedVersion },
        afterValue: { status: updated.status, version: updated.version },
      });
      return updated;
    });
    return { data: await this.toResponse(result, true) };
  }

  private async find(requestId: string): Promise<DeviceRequest> {
    const [request] = await this.db
      .select()
      .from(deviceChangeRequests)
      .where(eq(deviceChangeRequests.id, requestId))
      .limit(1);
    if (!request) throw new AppError("NOT_FOUND", 404, "The device-change request was not found.");
    return request;
  }

  private async toResponse(request: DeviceRequest, includePhoto: boolean) {
    return {
      id: request.id,
      participant: await this.identity.participantSummary(request.userId),
      status: request.status,
      requestedAt: request.createdAt.toISOString(),
      reviewedAt: request.decidedAt?.toISOString() ?? null,
      reviewedBy: request.reviewerUserId,
      decisionReason: request.decisionReason,
      photoAccessUrl: includePhoto ? await this.authorizedPhotoUrl(request.userId) : null,
      version: request.version,
    };
  }

  private async authorizedPhotoUrl(userId: string): Promise<string | null> {
    const [photo] = await this.db
      .select({ objectKey: identificationPhotos.objectKey })
      .from(identificationPhotos)
      .where(
        and(eq(identificationPhotos.userId, userId), eq(identificationPhotos.status, "ACTIVE")),
      )
      .limit(1);
    if (!photo) return null;
    try {
      return await this.photos.createReadUrl(photo.objectKey);
    } catch (error) {
      if (error instanceof AppError && error.code === "NOT_FOUND") return null;
      throw error;
    }
  }

  private async assertReviewPhotoAvailable(db: DatabaseClient, userId: string): Promise<void> {
    const [photo] = await db
      .select({ objectKey: identificationPhotos.objectKey })
      .from(identificationPhotos)
      .where(
        and(eq(identificationPhotos.userId, userId), eq(identificationPhotos.status, "ACTIVE")),
      )
      .limit(1);
    if (!photo) {
      throw new AppError(
        "CONFLICT",
        409,
        "The participant's protected identity photo is unavailable for review.",
      );
    }
    try {
      await this.photos.createReadUrl(photo.objectKey);
    } catch (error) {
      if (error instanceof AppError && error.code === "NOT_FOUND") {
        throw new AppError(
          "CONFLICT",
          409,
          "The participant's protected identity photo is unavailable for review.",
        );
      }
      throw error;
    }
  }

  private async assertCanView(request: DeviceRequest, actorId: string, actorRoles: string[]) {
    if (actorRoles.includes("ADMIN")) return;
    if (
      actorRoles.includes("COURSE_REP") &&
      request.status === "PENDING" &&
      request.userId !== actorId
    )
      return;
    throw new AppError(
      "AUTHORIZATION_DENIED",
      403,
      "You are not allowed to view this device review.",
    );
  }

  private assertCanDecide(request: DeviceRequest, actorId: string, actorRoles: string[]) {
    if (!actorRoles.includes("ADMIN") && !actorRoles.includes("COURSE_REP")) {
      throw new AppError(
        "AUTHORIZATION_DENIED",
        403,
        "You are not allowed to decide this device review.",
      );
    }
    if (request.userId === actorId) {
      throw new AppError(
        "SELF_APPROVAL_FORBIDDEN",
        403,
        "A reviewer cannot approve their own device replacement.",
      );
    }
  }

  private async assertParticipant(userId: string) {
    const [participant] = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(roleAssignments, eq(roleAssignments.userId, users.id))
      .where(
        and(
          eq(users.id, userId),
          eq(users.accountStatus, "ACTIVE"),
          eq(roleAssignments.role, "PARTICIPANT"),
          isNull(roleAssignments.revokedAt),
        ),
      )
      .limit(1);
    if (!participant)
      throw new AppError("NOT_A_PARTICIPANT", 403, "This account is not enabled for attendance.");
  }

  private actorRole(roles: string[]): "COURSE_REP" | "ADMIN" {
    return roles.includes("ADMIN") ? "ADMIN" : "COURSE_REP";
  }
}
