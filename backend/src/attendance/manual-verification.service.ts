import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, isNull, lte, ne, or, sql } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database, DatabaseClient } from "../database/database.module";
import {
  attendanceAttempts,
  attendanceRecords,
  attendanceSessions,
  identificationPhotos,
  manualVerificationCases,
  roleAssignments,
  users,
} from "../database/schema";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../identity/audit.service";
import { CourseConfigService } from "../identity/course-config.service";
import { IdentityService } from "../identity/identity.service";
import { PhotoService } from "../identity/photo.service";
import { JOB_QUEUE, JobQueue } from "../infrastructure/jobs/job-queue.port";
import { AttendanceService } from "./attendance.service";
import { ATTENDANCE_SHEETS_SYNC_JOB, MANUAL_CASE_EXPIRE_JOB } from "./job-types";
import { SessionService } from "./session.service";
import {
  AttendanceCorrectionDto,
  EmergencyAttendanceDto,
  ManualVerificationRequestDto,
} from "./dto/review.dto";

type ManualCase = typeof manualVerificationCases.$inferSelect;
type AttendanceRecord = typeof attendanceRecords.$inferSelect;
type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
type OperatorRole = "COURSE_REP" | "ADMIN" | "SYSTEM";

const explicitAttemptResults = [
  "LOCATION_PERMISSION_DENIED",
  "LOCATION_TIMEOUT",
  "LOCATION_UNAVAILABLE",
  "LOCATION_UNSUPPORTED",
  "CLEARLY_REMOTE",
] as const;

function validIdempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 16 || key.length > 200) {
    throw new AppError("VALIDATION_ERROR", 400, "Provide a valid Idempotency-Key header.");
  }
  return key;
}

@Injectable()
export class ManualVerificationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    private readonly audit: AuditService,
    private readonly config: CourseConfigService,
    private readonly attendance: AttendanceService,
    private readonly sessions: SessionService,
    private readonly identity: IdentityService,
    private readonly photos: PhotoService,
  ) {}

  async createExplicitRequest(
    userId: string,
    input: ManualVerificationRequestDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    validIdempotencyKey(idempotencyKey);
    await this.assertParticipant(userId);
    await this.sessions.reconcileDueSessions();

    const result = await this.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(attendanceAttempts)
        .where(
          and(eq(attendanceAttempts.id, input.attemptId), eq(attendanceAttempts.userId, userId)),
        )
        .limit(1);
      if (!attempt || !attempt.sessionId) {
        throw new AppError(
          "MANUAL_VERIFICATION_NOT_ALLOWED",
          409,
          "This attendance attempt is no longer eligible for manual review.",
        );
      }

      const [session] = await tx
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, attempt.sessionId))
        .limit(1);
      if (!session || session.status !== "OPEN") {
        throw new AppError(
          "MANUAL_VERIFICATION_NOT_ALLOWED",
          409,
          "Manual review is only available while attendance is open.",
        );
      }

      const [record] = await tx
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.sessionId, session.id),
            eq(attendanceRecords.userId, userId),
            eq(attendanceRecords.status, "PRESENT"),
          ),
        )
        .limit(1);
      if (record) {
        throw new AppError(
          "MANUAL_VERIFICATION_NOT_ALLOWED",
          409,
          "Attendance has already been recorded for this session.",
        );
      }

      const [existing] = await tx
        .select()
        .from(manualVerificationCases)
        .where(
          and(
            eq(manualVerificationCases.userId, userId),
            eq(manualVerificationCases.sessionId, session.id),
            or(
              eq(manualVerificationCases.status, "PENDING"),
              eq(manualVerificationCases.sourceAttemptId, attempt.id),
            ),
          ),
        )
        .orderBy(desc(manualVerificationCases.createdAt))
        .limit(1);

      if (existing) return { created: false, manualCase: existing };

      if (
        !explicitAttemptResults.includes(attempt.result as (typeof explicitAttemptResults)[number])
      ) {
        throw new AppError(
          "MANUAL_VERIFICATION_NOT_ALLOWED",
          409,
          "This attendance result does not need a separate manual request.",
        );
      }

      const config = await this.config.getRecord();
      const expiresAt = new Date(
        session.effectiveEndAt.getTime() + config.manualCaseGraceMinutes * 60 * 1000,
      );
      const [created] = await tx
        .insert(manualVerificationCases)
        .values({
          userId,
          sessionId: session.id,
          sourceAttemptId: attempt.id,
          source: "PARTICIPANT_REQUEST",
          reasonCode: attempt.result,
          reason: input.reason,
          expiresAt,
          version: 1,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) {
        const [raced] = await tx
          .select()
          .from(manualVerificationCases)
          .where(
            and(
              eq(manualVerificationCases.userId, userId),
              eq(manualVerificationCases.sessionId, session.id),
              eq(manualVerificationCases.status, "PENDING"),
            ),
          )
          .limit(1);
        if (!raced) throw new Error("Manual-verification request was not created.");
        return { created: false, manualCase: raced };
      }

      await this.jobs.enqueueWith(tx, {
        jobType: MANUAL_CASE_EXPIRE_JOB,
        sourceKey: `manual-case-expire:${created.id}`,
        payload: { caseId: created.id },
        runAfter: expiresAt,
      });
      await this.audit.recordWith(tx, {
        actorUserId: userId,
        actorRole: "PARTICIPANT",
        action: "MANUAL_VERIFICATION_REQUESTED",
        targetType: "MANUAL_VERIFICATION_CASE",
        targetId: created.id,
        reason: input.reason,
        correlationId,
        afterValue: { status: "PENDING", reasonCode: attempt.result },
      });
      return { created: true, manualCase: created };
    });

    return {
      created: result.created,
      data: await this.caseResponse(result.manualCase, false),
    };
  }

  async listOwn(userId: string, status?: ReviewStatus, limit = 50) {
    await this.assertParticipant(userId);
    await this.expireDueCases();
    const cases = await this.db
      .select()
      .from(manualVerificationCases)
      .where(
        and(
          eq(manualVerificationCases.userId, userId),
          status ? eq(manualVerificationCases.status, status) : undefined,
        ),
      )
      .orderBy(desc(manualVerificationCases.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return {
      items: await Promise.all(cases.map((item) => this.caseResponse(item, false))),
      nextCursor: null,
    };
  }

  async listOperator(actorId: string, actorRoles: string[], status?: ReviewStatus, limit = 50) {
    await this.expireDueCases();
    const isAdmin = actorRoles.includes("ADMIN");
    const now = new Date();
    const conditions = [
      status
        ? eq(manualVerificationCases.status, status)
        : eq(manualVerificationCases.status, "PENDING"),
    ];
    if (!isAdmin) {
      conditions.push(
        eq(manualVerificationCases.status, "PENDING"),
        ne(manualVerificationCases.userId, actorId),
        eq(attendanceSessions.status, "OPEN"),
        gt(attendanceSessions.effectiveEndAt, now),
      );
    }
    const rows = await this.db
      .select({ manualCase: manualVerificationCases })
      .from(manualVerificationCases)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, manualVerificationCases.sessionId))
      .where(and(...conditions))
      .orderBy(desc(manualVerificationCases.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return {
      items: await Promise.all(rows.map(({ manualCase }) => this.caseResponse(manualCase, false))),
      nextCursor: null,
    };
  }

  async detail(caseId: string, actorId: string, actorRoles: string[]) {
    const manualCase = await this.findCase(caseId);
    await this.assertCanView(manualCase, actorId, actorRoles);
    await this.expireCaseIfDue(caseId);
    const refreshed = await this.findCase(caseId);
    return { data: await this.caseResponse(refreshed, true) };
  }

  async decide(
    caseId: string,
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
      const [manualCase] = await tx
        .select()
        .from(manualVerificationCases)
        .where(eq(manualVerificationCases.id, caseId))
        .for("update")
        .limit(1);
      if (!manualCase) throw new AppError("NOT_FOUND", 404, "The manual review was not found.");
      await this.assertCanDecideWith(tx, manualCase, actorId, actorRoles, approve);

      if (manualCase.status !== "PENDING") return manualCase;
      if (manualCase.version !== expectedVersion) {
        throw new AppError(
          "STALE_STATE",
          409,
          "This manual review changed. Refresh and try again.",
        );
      }

      const now = new Date();
      if (manualCase.expiresAt <= now) {
        const [expired] = await tx
          .update(manualVerificationCases)
          .set({
            status: "EXPIRED",
            decidedAt: now,
            version: sql`${manualVerificationCases.version} + 1`,
          })
          .where(
            and(
              eq(manualVerificationCases.id, caseId),
              eq(manualVerificationCases.status, "PENDING"),
              eq(manualVerificationCases.version, expectedVersion),
            ),
          )
          .returning();
        if (!expired)
          throw new AppError(
            "STALE_STATE",
            409,
            "This manual review changed. Refresh and try again.",
          );
        await this.audit.recordWith(tx, {
          actorRole: "SYSTEM",
          action: "MANUAL_VERIFICATION_EXPIRED",
          targetType: "MANUAL_VERIFICATION_CASE",
          targetId: caseId,
          beforeValue: { status: "PENDING", version: expectedVersion },
          afterValue: { status: "EXPIRED", version: expired.version },
        });
        return expired;
      }

      const [session] = await tx
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, manualCase.sessionId))
        .limit(1);
      if (!session || session.status === "CANCELLED") {
        throw new AppError(
          "MANUAL_VERIFICATION_NOT_ALLOWED",
          409,
          "This session cannot accept manual attendance.",
        );
      }

      let record: AttendanceRecord | null = null;
      if (approve) {
        const [attempt] = manualCase.sourceAttemptId
          ? await tx
              .select()
              .from(attendanceAttempts)
              .where(
                and(
                  eq(attendanceAttempts.id, manualCase.sourceAttemptId),
                  eq(attendanceAttempts.userId, manualCase.userId),
                ),
              )
              .limit(1)
          : [];
        const [existing] = await tx
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.sessionId, manualCase.sessionId),
              eq(attendanceRecords.userId, manualCase.userId),
            ),
          )
          .limit(1);
        if (existing) {
          record = existing;
        } else {
          const [created] = await tx
            .insert(attendanceRecords)
            .values({
              sessionId: manualCase.sessionId,
              userId: manualCase.userId,
              status: "PRESENT",
              method: "MANUAL",
              checkedInAt: attempt?.receivedAt ?? now,
              sourceAttemptId: manualCase.sourceAttemptId,
              approvedByUserId: actorId,
              correctionReason: reason,
            })
            .onConflictDoNothing()
            .returning();
          if (created) record = created;
          else {
            const [raced] = await tx
              .select()
              .from(attendanceRecords)
              .where(
                and(
                  eq(attendanceRecords.sessionId, manualCase.sessionId),
                  eq(attendanceRecords.userId, manualCase.userId),
                ),
              )
              .limit(1);
            record = raced ?? null;
          }
        }
        if (!record) throw new Error("Manual attendance was not created.");
        await this.jobs.enqueueWith(tx, {
          jobType: ATTENDANCE_SHEETS_SYNC_JOB,
          sourceKey: `attendance-record:${record.id}`,
          payload: { attendanceRecordId: record.id, sessionId: manualCase.sessionId },
        });
      }

      const [updated] = await tx
        .update(manualVerificationCases)
        .set({
          status: approve ? "APPROVED" : "REJECTED",
          reviewerUserId: actorId,
          decisionReason: reason,
          decidedAt: now,
          version: sql`${manualVerificationCases.version} + 1`,
        })
        .where(
          and(
            eq(manualVerificationCases.id, caseId),
            eq(manualVerificationCases.status, "PENDING"),
            eq(manualVerificationCases.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated)
        throw new AppError(
          "STALE_STATE",
          409,
          "This manual review changed. Refresh and try again.",
        );
      const role = this.actorRole(actorRoles);
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: role,
        action: approve ? "MANUAL_VERIFICATION_APPROVED" : "MANUAL_VERIFICATION_REJECTED",
        targetType: "MANUAL_VERIFICATION_CASE",
        targetId: caseId,
        reason,
        correlationId,
        beforeValue: { status: "PENDING", version: expectedVersion },
        afterValue: {
          status: updated.status,
          version: updated.version,
          attendanceRecordId: record?.id ?? null,
        },
      });
      return updated;
    });

    return { data: await this.caseResponse(result, true) };
  }

  async createEmergency(
    actorId: string,
    actorRoles: string[],
    idempotencyKey: string,
    input: EmergencyAttendanceDto,
    correlationId?: string,
  ) {
    const key = validIdempotencyKey(idempotencyKey);
    await this.assertParticipant(input.participantId);
    await this.sessions.reconcileDueSessions();
    const result = await this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, input.sessionId))
        .for("update")
        .limit(1);
      const now = new Date();
      if (
        !session ||
        session.status !== "OPEN" ||
        session.effectiveStartAt > now ||
        session.effectiveEndAt <= now
      ) {
        throw new AppError(
          "SESSION_NOT_OPEN",
          409,
          "Emergency attendance is only available during an open session.",
        );
      }
      if (actorRoles.includes("COURSE_REP") && actorId === input.participantId) {
        throw new AppError(
          "SELF_APPROVAL_FORBIDDEN",
          403,
          "A Course Representative cannot create their own exception.",
        );
      }

      const [existingRecord] = await tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.sessionId, session.id),
            eq(attendanceRecords.userId, input.participantId),
          ),
        )
        .limit(1);
      if (existingRecord) return existingRecord;

      const [existingAttempt] = await tx
        .select()
        .from(attendanceAttempts)
        .where(
          and(
            eq(attendanceAttempts.userId, input.participantId),
            eq(attendanceAttempts.idempotencyKey, key),
          ),
        )
        .limit(1);
      if (existingAttempt) {
        const [replayed] = await tx
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.sessionId, session.id),
              eq(attendanceRecords.userId, input.participantId),
            ),
          )
          .limit(1);
        if (replayed) return replayed;
      }

      const [attempt] = await tx
        .insert(attendanceAttempts)
        .values({
          userId: input.participantId,
          sessionId: session.id,
          result: "PASS",
          locationOutcome: "EMERGENCY",
          policyVersion: "v1",
          idempotencyKey: key,
          correlationId,
        })
        .onConflictDoNothing({
          target: [attendanceAttempts.userId, attendanceAttempts.idempotencyKey],
        })
        .returning();
      const sourceAttempt = attempt ?? existingAttempt;
      if (!sourceAttempt) throw new Error("Emergency attendance attempt was not created.");

      const [record] = await tx
        .insert(attendanceRecords)
        .values({
          sessionId: session.id,
          userId: input.participantId,
          status: "PRESENT",
          method: "MANUAL",
          checkedInAt: now,
          sourceAttemptId: sourceAttempt.id,
          approvedByUserId: actorId,
          correctionReason: input.reason,
        })
        .onConflictDoNothing()
        .returning();
      if (!record) {
        const [raced] = await tx
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.sessionId, session.id),
              eq(attendanceRecords.userId, input.participantId),
            ),
          )
          .limit(1);
        if (!raced) throw new Error("Emergency attendance was not created.");
        return raced;
      }
      await this.jobs.enqueueWith(tx, {
        jobType: ATTENDANCE_SHEETS_SYNC_JOB,
        sourceKey: `attendance-record:${record.id}`,
        payload: { attendanceRecordId: record.id, sessionId: session.id },
      });
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: this.actorRole(actorRoles),
        action: "EMERGENCY_ATTENDANCE_RECORDED",
        targetType: "ATTENDANCE_RECORD",
        targetId: record.id,
        reason: input.reason,
        correlationId,
        afterValue: { sessionId: session.id, participantId: input.participantId, method: "MANUAL" },
      });
      return record;
    });
    return { data: await this.attendance.toRecordResponse(result) };
  }

  async expireDueCase(caseId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [manualCase] = await tx
        .select()
        .from(manualVerificationCases)
        .where(eq(manualVerificationCases.id, caseId))
        .for("update")
        .limit(1);
      if (!manualCase || manualCase.status !== "PENDING" || manualCase.expiresAt > new Date())
        return;
      const now = new Date();
      const [expired] = await tx
        .update(manualVerificationCases)
        .set({
          status: "EXPIRED",
          decidedAt: now,
          version: sql`${manualVerificationCases.version} + 1`,
        })
        .where(
          and(
            eq(manualVerificationCases.id, caseId),
            eq(manualVerificationCases.status, "PENDING"),
          ),
        )
        .returning();
      if (!expired) return;
      await this.audit.recordWith(tx, {
        actorRole: "SYSTEM",
        action: "MANUAL_VERIFICATION_EXPIRED",
        targetType: "MANUAL_VERIFICATION_CASE",
        targetId: caseId,
        beforeValue: { status: "PENDING", version: manualCase.version },
        afterValue: { status: "EXPIRED", version: expired.version },
      });
    });
  }

  async expireDueCases(): Promise<void> {
    const due = await this.db
      .select({ id: manualVerificationCases.id })
      .from(manualVerificationCases)
      .where(
        and(
          eq(manualVerificationCases.status, "PENDING"),
          lte(manualVerificationCases.expiresAt, new Date()),
        ),
      )
      .limit(100);
    await Promise.all(due.map(({ id }) => this.expireDueCase(id)));
  }

  async correctAttendance(
    actorId: string,
    input: AttendanceCorrectionDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    validIdempotencyKey(idempotencyKey);
    const result = await this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, input.sessionId))
        .for("update")
        .limit(1);
      if (!session) throw new AppError("NOT_FOUND", 404, "The attendance session was not found.");
      if (session.status !== "CLOSED") {
        throw new AppError(
          "CONFLICT",
          409,
          "Historical correction is available only after session close.",
        );
      }
      await this.assertParticipantWith(tx, input.participantId);
      const [existing] = await tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.sessionId, input.sessionId),
            eq(attendanceRecords.userId, input.participantId),
          ),
        )
        .for("update")
        .limit(1);
      const now = new Date();
      const before = existing
        ? {
            status: existing.status,
            method: existing.method,
            checkedInAt: existing.checkedInAt.toISOString(),
          }
        : null;
      const checkedInAt = input.checkedInAt
        ? new Date(input.checkedInAt)
        : (existing?.checkedInAt ?? session.closedAt ?? now);
      let record: AttendanceRecord | null = null;
      if (existing) {
        const [updated] = await tx
          .update(attendanceRecords)
          .set({
            status: input.targetStatus,
            method: "CORRECTION",
            checkedInAt,
            approvedByUserId: actorId,
            correctionReason: input.reason,
            correctedAt: now,
            updatedAt: now,
          })
          .where(eq(attendanceRecords.id, existing.id))
          .returning();
        record = updated ?? null;
      } else {
        const [created] = await tx
          .insert(attendanceRecords)
          .values({
            sessionId: input.sessionId,
            userId: input.participantId,
            status: input.targetStatus,
            method: "CORRECTION",
            checkedInAt,
            approvedByUserId: actorId,
            correctionReason: input.reason,
            correctedAt: now,
          })
          .returning();
        record = created ?? null;
      }
      if (!record) throw new Error("Attendance correction was not saved.");
      const auditEventId = await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: "ADMIN",
        action: "ATTENDANCE_CORRECTED",
        targetType: "ATTENDANCE_RECORD",
        targetId: record.id,
        reason: input.reason,
        correlationId,
        beforeValue: before ?? undefined,
        afterValue: {
          status: record.status,
          method: record.method,
          checkedInAt: record.checkedInAt.toISOString(),
        },
      });
      await this.jobs.enqueueWith(tx, {
        jobType: ATTENDANCE_SHEETS_SYNC_JOB,
        sourceKey: `attendance-record:${record.id}`,
        payload: { attendanceRecordId: record.id, sessionId: input.sessionId },
      });
      return { record, auditEventId };
    });
    return {
      sessionId: input.sessionId,
      participantId: input.participantId,
      effectiveStatus: result.record.status,
      record:
        result.record.status === "PRESENT"
          ? await this.attendance.toRecordResponse(result.record)
          : null,
      reason: input.reason,
      correctedAt: result.record.correctedAt?.toISOString() ?? new Date().toISOString(),
      correctedBy: actorId,
      auditEventId: result.auditEventId,
    };
  }

  private async findCase(caseId: string): Promise<ManualCase> {
    const [manualCase] = await this.db
      .select()
      .from(manualVerificationCases)
      .where(eq(manualVerificationCases.id, caseId))
      .limit(1);
    if (!manualCase) throw new AppError("NOT_FOUND", 404, "The manual review was not found.");
    return manualCase;
  }

  private async caseResponse(manualCase: ManualCase, includePhoto: boolean) {
    const data = await this.attendance.toCaseResponse(manualCase);
    const [record] = await this.db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.sessionId, manualCase.sessionId),
          eq(attendanceRecords.userId, manualCase.userId),
        ),
      )
      .limit(1);
    const photoAccessUrl = includePhoto ? await this.authorizedPhotoUrl(manualCase.userId) : null;
    return {
      ...data,
      photoAccessUrl,
      attendanceRecord:
        record?.status === "PRESENT" ? await this.attendance.toRecordResponse(record) : null,
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

  private async assertCanView(manualCase: ManualCase, actorId: string, actorRoles: string[]) {
    if (actorRoles.includes("ADMIN")) return;
    if (actorRoles.includes("COURSE_REP") && manualCase.userId !== actorId) {
      const [session] = await this.db
        .select({
          status: attendanceSessions.status,
          effectiveEndAt: attendanceSessions.effectiveEndAt,
        })
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, manualCase.sessionId))
        .limit(1);
      if (session?.status === "OPEN" && session.effectiveEndAt > new Date()) return;
    }
    throw new AppError(
      "AUTHORIZATION_DENIED",
      403,
      "You are not allowed to view this manual review.",
    );
  }

  private async assertCanDecideWith(
    tx: DatabaseClient,
    manualCase: ManualCase,
    actorId: string,
    actorRoles: string[],
    approve: boolean,
  ) {
    if (!actorRoles.includes("ADMIN") && !actorRoles.includes("COURSE_REP")) {
      throw new AppError(
        "AUTHORIZATION_DENIED",
        403,
        "You are not allowed to decide this manual review.",
      );
    }
    if (actorRoles.includes("COURSE_REP") && manualCase.userId === actorId) {
      throw new AppError(
        "SELF_APPROVAL_FORBIDDEN",
        403,
        "A Course Representative cannot approve their own exception.",
      );
    }
    if (approve && actorRoles.includes("COURSE_REP") && !actorRoles.includes("ADMIN")) {
      await this.assertReviewPhotoAvailable(tx, manualCase.userId);
    }
    if (actorRoles.includes("COURSE_REP") && !actorRoles.includes("ADMIN")) {
      const [session] = await tx
        .select({
          status: attendanceSessions.status,
          effectiveEndAt: attendanceSessions.effectiveEndAt,
        })
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, manualCase.sessionId))
        .limit(1);
      if (!session || session.status !== "OPEN" || session.effectiveEndAt <= new Date()) {
        throw new AppError(
          "MANUAL_VERIFICATION_EXPIRED",
          409,
          "This manual review is no longer in the Course Representative window.",
        );
      }
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

  private async expireCaseIfDue(caseId: string) {
    await this.expireDueCase(caseId);
  }

  private async assertParticipant(userId: string) {
    return this.assertParticipantWith(this.db, userId);
  }

  private async assertParticipantWith(db: DatabaseClient, userId: string) {
    const [participant] = await db
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

  private actorRole(roles: string[]): OperatorRole {
    if (roles.includes("ADMIN")) return "ADMIN";
    if (roles.includes("COURSE_REP")) return "COURSE_REP";
    return "SYSTEM";
  }
}
