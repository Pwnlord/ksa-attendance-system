import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database, DatabaseClient } from "../database/database.module";
import {
  attendanceAttempts,
  attendanceRecords,
  attendanceSessions,
  manualVerificationCases,
  rosterEntries,
} from "../database/schema";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../identity/audit.service";
import { CourseConfigService } from "../identity/course-config.service";
import { IdentityService } from "../identity/identity.service";
import { RateLimitService } from "../identity/rate-limit.service";
import { RoleService } from "../identity/role.service";
import { DeviceCredentialService } from "../security/attendance-device/device-credential.service";
import { JOB_QUEUE, JobQueue } from "../infrastructure/jobs/job-queue.port";
import { ATTENDANCE_SHEETS_SYNC_JOB, MANUAL_CASE_EXPIRE_JOB } from "./job-types";
import { evaluateLocation } from "./geo";
import { SessionService } from "./session.service";
import { CheckInDto } from "./dto/check-in.dto";

type AttemptResult = typeof attendanceAttempts.$inferInsert.result;
type Attempt = typeof attendanceAttempts.$inferSelect;
type Record = typeof attendanceRecords.$inferSelect;
type ManualCase = typeof manualVerificationCases.$inferSelect;

const locationFailureOutcomes = {
  PERMISSION_DENIED: "LOCATION_PERMISSION_DENIED",
  TIMEOUT: "LOCATION_TIMEOUT",
  UNAVAILABLE: "LOCATION_UNAVAILABLE",
  UNSUPPORTED: "LOCATION_UNSUPPORTED",
} as const;

function localDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505",
  );
}

export interface CheckInResponse {
  httpStatus: 200 | 201 | 409 | 422;
  data: {
    outcome: string;
    serverTime: string;
    attemptId: string | null;
    manualRequestAllowed: boolean;
    attendanceRecord: unknown | null;
    manualVerificationCase: unknown | null;
    deviceChangeRequest: null;
  };
}

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    private readonly config: CourseConfigService,
    private readonly sessions: SessionService,
    private readonly devices: DeviceCredentialService,
    private readonly roles: RoleService,
    private readonly identity: IdentityService,
    private readonly limits: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  async context(userId: string, deviceToken: string | undefined) {
    if (!(await this.roles.hasAny(userId, ["PARTICIPANT"]))) {
      throw new AppError("NOT_A_PARTICIPANT", 403, "This account is not enabled for attendance.");
    }
    const config = await this.config.getRecord();
    await this.sessions.reconcileDueSessions();
    const deviceStatus = await this.devices.browserStatus(userId, deviceToken);
    const now = new Date();
    const [open] = await this.db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.status, "OPEN"),
          sql`${attendanceSessions.effectiveStartAt} <= ${now}`,
          sql`${attendanceSessions.effectiveEndAt} > ${now}`,
        ),
      )
      .orderBy(desc(attendanceSessions.effectiveStartAt))
      .limit(1);

    if (open) {
      const [record] = await this.db
        .select()
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.sessionId, open.id), eq(attendanceRecords.userId, userId)))
        .limit(1);
      return {
        data: {
          state: record ? "ALREADY_PRESENT" : "OPEN",
          session: await this.sessions.toResponse(open, config.timezone),
          attendanceRecord: record ? await this.toRecordResponse(record) : null,
          deviceStatus,
          locationAcquisitionTimeoutSeconds: config.locationTimeoutSeconds,
        },
      };
    }

    const [closed] = await this.db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.attendanceDate, localDate(now, config.timezone)),
          eq(attendanceSessions.status, "CLOSED"),
        ),
      )
      .orderBy(desc(attendanceSessions.effectiveEndAt))
      .limit(1);
    return {
      data: {
        state: closed ? "CLOSED" : "NOT_OPEN",
        session: closed ? await this.sessions.toResponse(closed, config.timezone) : null,
        attendanceRecord: null,
        deviceStatus,
        locationAcquisitionTimeoutSeconds: config.locationTimeoutSeconds,
      },
    };
  }

  async history(userId: string, limit = 50) {
    if (!(await this.roles.hasAny(userId, ["PARTICIPANT"]))) {
      throw new AppError("NOT_A_PARTICIPANT", 403, "This account is not enabled for attendance.");
    }
    await this.sessions.reconcileDueSessions();
    const config = await this.config.getRecord();
    const [roster] = await this.db
      .select({ enrollmentEffectiveDate: rosterEntries.enrollmentEffectiveDate })
      .from(rosterEntries)
      .where(and(eq(rosterEntries.claimedUserId, userId), eq(rosterEntries.status, "CLAIMED")))
      .limit(1);
    const sessions = await this.db
      .select()
      .from(attendanceSessions)
      .where(inArray(attendanceSessions.status, ["SCHEDULED", "OPEN", "CLOSED", "CANCELLED"]))
      .orderBy(desc(attendanceSessions.attendanceDate), desc(attendanceSessions.effectiveStartAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    const items = await Promise.all(
      sessions.map(async (session) => {
        const [record] = await this.db
          .select()
          .from(attendanceRecords)
          .where(
            and(eq(attendanceRecords.sessionId, session.id), eq(attendanceRecords.userId, userId)),
          )
          .limit(1);
        const beforeEnrollment = Boolean(
          roster && session.attendanceDate < roster.enrollmentEffectiveDate,
        );
        const attendanceStatus =
          beforeEnrollment || session.status === "CANCELLED"
            ? "NOT_APPLICABLE"
            : (record?.status ?? (session.status === "CLOSED" ? "ABSENT" : "NOT_APPLICABLE"));
        return {
          sessionId: session.id,
          attendanceDate: session.attendanceDate,
          sessionStatus: session.status,
          attendanceStatus,
          record: record?.status === "PRESENT" ? await this.toRecordResponse(record) : null,
          timezone: config.timezone,
        };
      }),
    );
    return { items, nextCursor: null };
  }

  async checkIn(
    userId: string,
    deviceToken: string | undefined,
    idempotencyKey: string,
    input: CheckInDto,
    correlationId?: string,
  ): Promise<CheckInResponse> {
    const key = idempotencyKey.trim();
    if (key.length < 16 || key.length > 200) {
      throw new AppError("VALIDATION_ERROR", 400, "Provide a valid Idempotency-Key header.");
    }
    if (Boolean(input.location) === Boolean(input.locationFailure)) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "Provide a location reading or a location failure.",
      );
    }
    if (!(await this.roles.hasAny(userId, ["PARTICIPANT"]))) {
      throw new AppError("NOT_A_PARTICIPANT", 403, "This account is not enabled for attendance.");
    }

    const config = await this.config.getRecord();
    await this.sessions.reconcileDueSessions();
    await this.limits.assertAllowed(
      `attendance:${userId}`,
      config.attendanceLimitPerMinute,
      60 * 1000,
    );
    const browserDevice = await this.devices.validateAndTouch(deviceToken);
    const deviceId = browserDevice?.userId === userId ? browserDevice.id : null;
    const reading = input.location
      ? {
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          accuracyMetres: input.location.accuracyMetres,
          capturedAt: new Date(input.location.capturedAt),
        }
      : undefined;

    const result = await this.db.transaction(async (tx) => {
      const replay = await this.existingAttempt(tx, userId, key);
      if (replay) return this.replayResult(tx, replay, config.timezone);

      const now = new Date();
      const session = await this.openSession(tx, now);
      if (!session) {
        const closed = await this.closedSessionForToday(tx, now, config.timezone);
        const outcome = closed ? "SESSION_CLOSED" : "SESSION_NOT_OPEN";
        const attempt = await this.insertAttempt(tx, {
          userId,
          sessionId: closed?.id,
          attendanceDeviceId: deviceId ?? undefined,
          result: outcome,
          idempotencyKey: key,
          correlationId,
          policyVersion: "v1",
        });
        return {
          outcome,
          attemptId: attempt.id,
          record: null,
          manualCase: null,
          serverTime: now,
          manualRequestAllowed: false,
        };
      }

      const [existingRecord] = await tx
        .select()
        .from(attendanceRecords)
        .where(
          and(eq(attendanceRecords.sessionId, session.id), eq(attendanceRecords.userId, userId)),
        )
        .limit(1);
      if (existingRecord) {
        const attempt = await this.insertAttempt(tx, {
          userId,
          sessionId: session.id,
          attendanceDeviceId: deviceId ?? undefined,
          result: "DUPLICATE",
          idempotencyKey: key,
          correlationId,
          policyVersion: "v1",
        });
        return {
          outcome: "ALREADY_CHECKED_IN",
          attemptId: attempt.id,
          record: existingRecord,
          manualCase: null,
          serverTime: now,
          manualRequestAllowed: false,
        };
      }

      if (!deviceId) {
        const attempt = await this.insertAttempt(tx, {
          userId,
          sessionId: session.id,
          result: "DEVICE_CHANGE_REQUIRED",
          idempotencyKey: key,
          correlationId,
          policyVersion: "v1",
        });
        return {
          outcome: "DEVICE_CHANGE_REQUIRED",
          attemptId: attempt.id,
          record: null,
          manualCase: null,
          serverTime: now,
          manualRequestAllowed: false,
        };
      }

      if (!reading) {
        const outcome = locationFailureOutcomes[input.locationFailure!];
        const attempt = await this.insertAttempt(tx, {
          userId,
          sessionId: session.id,
          attendanceDeviceId: deviceId,
          result: outcome,
          locationOutcome: input.locationFailure,
          idempotencyKey: key,
          correlationId,
          policyVersion: "v1",
        });
        return {
          outcome,
          attemptId: attempt.id,
          record: null,
          manualCase: null,
          serverTime: now,
          manualRequestAllowed: true,
        };
      }

      const evaluation = evaluateLocation(
        reading,
        {
          venueLatitude: Number(config.venueLatitude),
          venueLongitude: Number(config.venueLongitude),
          geofenceRadiusMeters: config.geofenceRadiusMeters,
          maxAutomaticAccuracyMeters: config.maxAutomaticAccuracyMeters,
          clearlyRemoteBoundaryMeters: config.clearlyRemoteBoundaryMeters,
          locationFreshnessSeconds: config.locationFreshnessSeconds,
        },
        now,
      );
      const stale = evaluation === "STALE";
      const locationOutcome = stale ? "STALE" : evaluation.outcome;
      const distance = stale ? undefined : evaluation.roundedDistanceMeters;
      const accuracy = reading.accuracyMetres.toFixed(2);
      if (!stale && evaluation.outcome === "PASS") {
        const attempt = await this.insertAttempt(tx, {
          userId,
          sessionId: session.id,
          attendanceDeviceId: deviceId,
          result: "PASS",
          roundedDistanceMeters: distance,
          reportedAccuracyMeters: accuracy,
          locationOutcome,
          policyVersion: "v1",
          idempotencyKey: key,
          correlationId,
        });
        const [record] = await tx
          .insert(attendanceRecords)
          .values({
            sessionId: session.id,
            userId,
            status: "PRESENT",
            method: "QR",
            checkedInAt: now,
            sourceAttemptId: attempt.id,
          })
          .onConflictDoNothing()
          .returning();
        if (!record) {
          const [existing] = await tx
            .select()
            .from(attendanceRecords)
            .where(
              and(
                eq(attendanceRecords.sessionId, session.id),
                eq(attendanceRecords.userId, userId),
              ),
            )
            .limit(1);
          await tx
            .update(attendanceAttempts)
            .set({ result: "DUPLICATE" })
            .where(eq(attendanceAttempts.id, attempt.id));
          return {
            outcome: "ALREADY_CHECKED_IN",
            attemptId: attempt.id,
            record: existing ?? null,
            manualCase: null,
            serverTime: now,
            manualRequestAllowed: false,
          };
        }
        await this.jobs.enqueueWith(tx, {
          jobType: ATTENDANCE_SHEETS_SYNC_JOB,
          sourceKey: `attendance-record:${record.id}`,
          payload: { attendanceRecordId: record.id, sessionId: session.id },
        });
        await this.audit.recordWith(tx, {
          actorUserId: userId,
          actorRole: "PARTICIPANT",
          action: "ATTENDANCE_RECORDED",
          targetType: "ATTENDANCE_RECORD",
          targetId: record.id,
          correlationId,
          afterValue: { sessionId: session.id, method: "QR", status: "PRESENT" },
        });
        return {
          outcome: "ATTENDANCE_RECORDED",
          attemptId: attempt.id,
          record,
          manualCase: null,
          serverTime: now,
          manualRequestAllowed: false,
        };
      }

      const outcome = stale ? "LOCATION_UNCERTAIN" : evaluation.outcome;
      const attempt = await this.insertAttempt(tx, {
        userId,
        sessionId: session.id,
        attendanceDeviceId: deviceId,
        result: outcome,
        roundedDistanceMeters: distance,
        reportedAccuracyMeters: accuracy,
        locationOutcome,
        policyVersion: "v1",
        idempotencyKey: key,
        correlationId,
      });
      let manualCase: ManualCase | null = null;
      if (!stale && evaluation.outcome === "LOCATION_UNCERTAIN") {
        const expiresAt = new Date(
          session.effectiveEndAt.getTime() + config.manualCaseGraceMinutes * 60 * 1000,
        );
        const [createdCase] = await tx
          .insert(manualVerificationCases)
          .values({
            userId,
            sessionId: session.id,
            sourceAttemptId: attempt.id,
            source: "AUTOMATIC_UNCERTAIN",
            reasonCode: "LOCATION_UNCERTAIN",
            reason: "LOCATION_UNCERTAIN",
            expiresAt,
            version: 1,
          })
          .onConflictDoNothing()
          .returning();
        if (createdCase) manualCase = createdCase;
        else {
          const [existingCase] = await tx
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
          manualCase = existingCase ?? null;
        }
        if (createdCase) {
          await this.jobs.enqueueWith(tx, {
            jobType: MANUAL_CASE_EXPIRE_JOB,
            sourceKey: `manual-case-expire:${createdCase.id}`,
            payload: { caseId: createdCase.id },
            runAfter: expiresAt,
          });
        }
      }
      return {
        outcome,
        attemptId: attempt.id,
        record: null,
        manualCase,
        serverTime: now,
        manualRequestAllowed: true,
      };
    });

    const status =
      result.outcome === "ATTENDANCE_RECORDED"
        ? 201
        : result.outcome === "ALREADY_CHECKED_IN" || result.outcome === "ATTENDANCE_RECORDED"
          ? 200
          : result.outcome === "SESSION_NOT_OPEN" ||
              result.outcome === "SESSION_CLOSED" ||
              result.outcome === "DEVICE_CHANGE_REQUIRED"
            ? 409
            : 422;
    return {
      httpStatus: status,
      data: {
        outcome: result.outcome,
        serverTime: result.serverTime.toISOString(),
        attemptId: result.attemptId,
        manualRequestAllowed: result.manualRequestAllowed,
        attendanceRecord: result.record ? await this.toRecordResponse(result.record) : null,
        manualVerificationCase: result.manualCase
          ? await this.toCaseResponse(result.manualCase)
          : null,
        deviceChangeRequest: null,
      },
    };
  }

  private async openSession(db: DatabaseClient, now: Date) {
    const [session] = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.status, "OPEN"),
          sql`${attendanceSessions.effectiveStartAt} <= ${now}`,
          sql`${attendanceSessions.effectiveEndAt} > ${now}`,
        ),
      )
      .orderBy(desc(attendanceSessions.effectiveStartAt))
      .limit(1)
      .for("update");
    return session;
  }

  private async closedSessionForToday(db: DatabaseClient, now: Date, timezone: string) {
    const [session] = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.attendanceDate, localDate(now, timezone)),
          eq(attendanceSessions.status, "CLOSED"),
        ),
      )
      .orderBy(desc(attendanceSessions.effectiveEndAt))
      .limit(1);
    return session;
  }

  private async existingAttempt(db: DatabaseClient, userId: string, key: string) {
    const [attempt] = await db
      .select()
      .from(attendanceAttempts)
      .where(and(eq(attendanceAttempts.userId, userId), eq(attendanceAttempts.idempotencyKey, key)))
      .limit(1);
    return attempt;
  }

  private async insertAttempt(
    db: DatabaseClient,
    input: {
      userId: string;
      sessionId?: string;
      attendanceDeviceId?: string;
      result: AttemptResult;
      roundedDistanceMeters?: number;
      reportedAccuracyMeters?: string;
      locationOutcome?: string;
      policyVersion?: string;
      idempotencyKey: string;
      correlationId?: string;
    },
  ): Promise<Attempt> {
    try {
      const [attempt] = await db
        .insert(attendanceAttempts)
        .values(input)
        .onConflictDoNothing({
          target: [attendanceAttempts.userId, attendanceAttempts.idempotencyKey],
        })
        .returning();
      if (attempt) return attempt;
      const existing = await this.existingAttempt(db, input.userId, input.idempotencyKey);
      if (existing) return existing;
      throw new Error("Attendance attempt was not created.");
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.existingAttempt(db, input.userId, input.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async replayResult(db: DatabaseClient, attempt: Attempt, timezone: string) {
    const isDuplicate = attempt.result === "DUPLICATE";
    const record = attempt.sessionId
      ? await this.recordForUserSession(db, attempt.sessionId, attempt.userId)
      : null;
    const outcome =
      isDuplicate || attempt.result === "PASS"
        ? record
          ? "ALREADY_CHECKED_IN"
          : attempt.result
        : attempt.result;
    return {
      outcome,
      attemptId: attempt.id,
      record,
      manualCase:
        attempt.sessionId && attempt.result === "LOCATION_UNCERTAIN"
          ? await this.pendingCaseForUserSession(db, attempt.userId, attempt.sessionId)
          : null,
      serverTime: attempt.receivedAt,
      manualRequestAllowed: [
        "LOCATION_UNCERTAIN",
        "LOCATION_PERMISSION_DENIED",
        "LOCATION_TIMEOUT",
        "LOCATION_UNAVAILABLE",
        "LOCATION_UNSUPPORTED",
        "CLEARLY_REMOTE",
      ].includes(attempt.result),
      timezone,
    };
  }

  private async recordForUserSession(db: DatabaseClient, sessionId: string, userId: string) {
    const [record] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.userId, userId)))
      .limit(1);
    return record ?? null;
  }

  private async pendingCaseForUserSession(db: DatabaseClient, userId: string, sessionId: string) {
    const [manualCase] = await db
      .select()
      .from(manualVerificationCases)
      .where(
        and(
          eq(manualVerificationCases.userId, userId),
          eq(manualVerificationCases.sessionId, sessionId),
          eq(manualVerificationCases.status, "PENDING"),
        ),
      )
      .limit(1);
    return manualCase ?? null;
  }

  async toRecordResponse(record: Record) {
    return {
      id: record.id,
      sessionId: record.sessionId,
      participant: await this.identity.participantSummary(record.userId),
      status: "PRESENT" as const,
      method: record.method === "CORRECTION" ? "MANUAL" : record.method,
      checkedInAt: record.checkedInAt.toISOString(),
      approvedBy: record.approvedByUserId ? { id: record.approvedByUserId } : null,
      locationStatus: record.method === "QR" ? "VERIFIED" : "MANUAL",
    };
  }

  async toCaseResponse(manualCase: ManualCase) {
    return {
      id: manualCase.id,
      participant: await this.identity.participantSummary(manualCase.userId),
      sessionId: manualCase.sessionId,
      sourceAttemptId: manualCase.sourceAttemptId,
      creationSource: manualCase.source === "EMERGENCY" ? "OPERATOR_EMERGENCY" : manualCase.source,
      reasonCode: manualCase.reasonCode,
      status: manualCase.status,
      participantReason: manualCase.source === "PARTICIPANT_REQUEST" ? manualCase.reason : null,
      requestedAt: manualCase.createdAt.toISOString(),
      expiresAt: manualCase.expiresAt.toISOString(),
      reviewedAt: manualCase.decidedAt?.toISOString() ?? null,
      reviewedBy: manualCase.reviewerUserId,
      decisionReason: manualCase.decisionReason,
      version: manualCase.version,
    };
  }
}
