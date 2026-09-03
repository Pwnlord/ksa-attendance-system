import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.module";
import { courseConfig, identificationPhotos, photoChangeRequests } from "../database/schema";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "./audit.service";
import { IdentityService } from "./identity.service";
import { PhotoService, UploadFile } from "./photo.service";
import { JOB_QUEUE, JobQueue } from "../infrastructure/jobs/job-queue.port";
import { PHOTO_RETENTION_JOB } from "./identity.constants";

@Injectable()
export class PhotoChangeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly photos: PhotoService,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  async create(userId: string, file: UploadFile | undefined, note?: string) {
    const [pending] = await this.db
      .select({ id: photoChangeRequests.id })
      .from(photoChangeRequests)
      .where(and(eq(photoChangeRequests.userId, userId), eq(photoChangeRequests.status, "PENDING")))
      .limit(1);
    if (pending)
      throw new AppError("CONFLICT", 409, "You already have a photo replacement awaiting review.");

    const processed = await this.photos.process(file);
    await this.photos.store(processed);
    try {
      const result = await this.db.transaction(async (tx) => {
        const [latest] = await tx
          .select({ version: identificationPhotos.version })
          .from(identificationPhotos)
          .where(eq(identificationPhotos.userId, userId))
          .orderBy(desc(identificationPhotos.version))
          .limit(1);
        const [candidate] = await tx
          .insert(identificationPhotos)
          .values({
            userId,
            objectKey: processed.objectKey,
            status: "CANDIDATE",
            version: (latest?.version ?? 0) + 1,
            contentType: processed.contentType,
            byteSize: processed.byteSize,
            width: processed.width,
            height: processed.height,
            checksum: processed.checksum,
          })
          .returning({ id: identificationPhotos.id });
        if (!candidate) throw new Error("Photo candidate was not created.");
        const [request] = await tx
          .insert(photoChangeRequests)
          .values({ userId, candidatePhotoId: candidate.id, requestNote: note ?? null })
          .returning({ id: photoChangeRequests.id });
        if (!request) throw new Error("Photo change request was not created.");
        await this.audit.recordWith(tx, {
          actorUserId: userId,
          actorRole: "PARTICIPANT",
          action: "PHOTO_REPLACEMENT_REQUESTED",
          targetType: "PHOTO_CHANGE_REQUEST",
          targetId: request.id,
          afterValue: { status: "PENDING" },
        });
        return request.id;
      });
      return this.detail(result, false);
    } catch (error) {
      await this.photos.remove(processed.objectKey);
      throw error;
    }
  }

  async listOwn(userId: string) {
    const requests = await this.db
      .select()
      .from(photoChangeRequests)
      .where(eq(photoChangeRequests.userId, userId))
      .orderBy(desc(photoChangeRequests.createdAt));
    return { items: await Promise.all(requests.map((request) => this.toResponse(request, false))) };
  }

  async listAdmin(status?: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED") {
    const requests = await this.db
      .select()
      .from(photoChangeRequests)
      .where(status ? eq(photoChangeRequests.status, status) : undefined)
      .orderBy(desc(photoChangeRequests.createdAt));
    return { items: await Promise.all(requests.map((request) => this.toResponse(request, false))) };
  }

  async detail(requestId: string, includePhoto: boolean) {
    const [request] = await this.db
      .select()
      .from(photoChangeRequests)
      .where(eq(photoChangeRequests.id, requestId))
      .limit(1);
    if (!request) throw new AppError("NOT_FOUND", 404, "The requested photo review was not found.");
    return this.toResponse(request, includePhoto);
  }

  async decide(
    requestId: string,
    reviewerId: string,
    expectedVersion: number,
    reason: string,
    approve: boolean,
  ) {
    let rejectedObjectKey: string | undefined;
    await this.db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(photoChangeRequests)
        .where(eq(photoChangeRequests.id, requestId))
        .for("update")
        .limit(1);
      if (!request)
        throw new AppError("NOT_FOUND", 404, "The requested photo review was not found.");
      if (request.status !== "PENDING") return;
      if (request.version !== expectedVersion) {
        throw new AppError("STALE_STATE", 409, "This photo review changed. Refresh and try again.");
      }

      const [candidate] = await tx
        .select()
        .from(identificationPhotos)
        .where(eq(identificationPhotos.id, request.candidatePhotoId))
        .limit(1);
      if (!candidate) throw new AppError("NOT_FOUND", 404, "The photo candidate was not found.");
      const now = new Date();
      if (approve) {
        const [current] = await tx
          .select()
          .from(identificationPhotos)
          .where(
            and(
              eq(identificationPhotos.userId, request.userId),
              eq(identificationPhotos.status, "ACTIVE"),
            ),
          )
          .limit(1);
        const [config] = await tx
          .select()
          .from(courseConfig)
          .where(eq(courseConfig.singletonKey, "default"))
          .limit(1);
        const retentionDeleteAt = new Date(
          now.getTime() + (config?.photoRetentionDaysAfterCourse ?? 90) * 24 * 60 * 60 * 1000,
        );
        if (current) {
          await tx
            .update(identificationPhotos)
            .set({ status: "SUPERSEDED", retentionDeleteAt })
            .where(eq(identificationPhotos.id, current.id));
          await this.jobs.enqueueWith(tx, {
            jobType: PHOTO_RETENTION_JOB,
            sourceKey: `photo-retention:${current.id}`,
            payload: { photoId: current.id },
            runAfter: retentionDeleteAt,
          });
        }
        await tx
          .update(identificationPhotos)
          .set({ status: "ACTIVE", approvedAt: now })
          .where(eq(identificationPhotos.id, candidate.id));
      } else {
        rejectedObjectKey = candidate.objectKey;
        await tx
          .update(identificationPhotos)
          .set({ status: "DELETED" })
          .where(eq(identificationPhotos.id, candidate.id));
      }
      await tx
        .update(photoChangeRequests)
        .set({
          status: approve ? "APPROVED" : "REJECTED",
          reviewerUserId: reviewerId,
          decisionReason: reason,
          decidedAt: now,
          version: sql`${photoChangeRequests.version} + 1`,
        })
        .where(
          and(
            eq(photoChangeRequests.id, requestId),
            eq(photoChangeRequests.version, expectedVersion),
          ),
        );
      await this.audit.recordWith(tx, {
        actorUserId: reviewerId,
        actorRole: "ADMIN",
        action: approve ? "PHOTO_REPLACEMENT_APPROVED" : "PHOTO_REPLACEMENT_REJECTED",
        targetType: "PHOTO_CHANGE_REQUEST",
        targetId: requestId,
        reason,
        beforeValue: { status: "PENDING" },
        afterValue: { status: approve ? "APPROVED" : "REJECTED" },
      });
    });
    if (rejectedObjectKey) await this.photos.remove(rejectedObjectKey);
    return this.detail(requestId, true);
  }

  private async toResponse(
    request: typeof photoChangeRequests.$inferSelect,
    includePhoto: boolean,
  ) {
    const participant = await this.identity.participantSummary(request.userId);
    return {
      id: request.id,
      participant,
      status: request.status,
      note: request.requestNote,
      requestedAt: request.createdAt,
      reviewedAt: request.decidedAt,
      reviewedBy: request.reviewerUserId,
      decisionReason: request.decisionReason,
      ...(includePhoto
        ? await this.photoUrls(request)
        : { currentPhotoAccessUrl: null, candidatePhotoAccessUrl: null }),
      version: request.version,
    };
  }

  private async photoUrls(request: typeof photoChangeRequests.$inferSelect) {
    const [candidate] = await this.db
      .select({ objectKey: identificationPhotos.objectKey })
      .from(identificationPhotos)
      .where(
        and(
          eq(identificationPhotos.id, request.candidatePhotoId),
          sql`${identificationPhotos.status} <> 'DELETED'`,
        ),
      )
      .limit(1);
    const [current] = await this.db
      .select({ objectKey: identificationPhotos.objectKey })
      .from(identificationPhotos)
      .where(
        and(
          eq(identificationPhotos.userId, request.userId),
          eq(identificationPhotos.status, "ACTIVE"),
        ),
      )
      .limit(1);
    return {
      currentPhotoAccessUrl: current ? await this.photos.createReadUrl(current.objectKey) : null,
      candidatePhotoAccessUrl: candidate
        ? await this.photos.createReadUrl(candidate.objectKey)
        : null,
    };
  }
}
