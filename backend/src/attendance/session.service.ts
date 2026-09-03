import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database, DatabaseClient } from "../database/database.module";
import {
  attendanceRecords,
  attendanceSessions,
  manualVerificationCases,
  users,
} from "../database/schema";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../identity/audit.service";
import { CourseConfigService } from "../identity/course-config.service";
import { IdentityService } from "../identity/identity.service";
import { JOB_QUEUE, JobQueue } from "../infrastructure/jobs/job-queue.port";
import {
  ATTENDANCE_SHEETS_SYNC_JOB,
  MANUAL_CASE_EXPIRE_JOB,
  SESSION_AUTO_CLOSE_JOB,
  SESSION_AUTO_OPEN_JOB,
} from "./job-types";
import {
  CreateSessionDto,
  ExtendSessionDto,
  ReasonedVersionedCommandDto,
  ReopenSessionDto,
  VersionedCommandDto,
} from "./dto/session.dto";

type Session = typeof attendanceSessions.$inferSelect;
type ActorRole = "COURSE_REP" | "ADMIN" | "SYSTEM";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505",
  );
}

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

function parsedDate(value: string, field: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new AppError("VALIDATION_ERROR", 400, `Enter a valid ${field}.`, { field });
  }
  return date;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    private readonly audit: AuditService,
    private readonly config: CourseConfigService,
    private readonly identity: IdentityService,
  ) {}

  async create(
    actorId: string,
    actorRoles: string[],
    input: CreateSessionDto,
    correlationId?: string,
  ) {
    const config = await this.config.getRecord();
    const start = parsedDate(input.effectiveStart, "effective start");
    const end = input.effectiveEnd
      ? parsedDate(input.effectiveEnd, "effective end")
      : new Date(start.getTime() + config.defaultSessionDurationMinutes * 60 * 1000);
    const now = new Date();
    this.assertWindow(start, end);
    if (input.attendanceDate !== localDate(start, config.timezone)) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "The attendance date must match the session start date in the course timezone.",
      );
    }
    if (input.initialStatus === "SCHEDULED" && start <= now) {
      throw new AppError("CONFLICT", 409, "A scheduled session must start in the future.");
    }
    if (input.initialStatus === "OPEN" && start > now) {
      throw new AppError("CONFLICT", 409, "A session cannot be opened before its start time.");
    }
    if (input.initialStatus === "OPEN" && end <= now) {
      throw new AppError("CONFLICT", 409, "A session cannot be opened after its end time.");
    }

    try {
      const created = await this.db.transaction(async (tx) => {
        const [session] = await tx
          .insert(attendanceSessions)
          .values({
            courseConfigId: config.id,
            attendanceDate: input.attendanceDate,
            status: input.initialStatus,
            originalStartAt: start,
            originalEndAt: end,
            effectiveStartAt: start,
            effectiveEndAt: end,
            version: 1,
            createdByUserId: actorId,
            openedByUserId: input.initialStatus === "OPEN" ? actorId : null,
            openedAt: input.initialStatus === "OPEN" ? now : null,
          })
          .returning();
        if (!session) throw new Error("Attendance session was not created.");
        await this.audit.recordWith(tx, {
          actorUserId: actorId,
          actorRole: this.actorRole(actorRoles),
          action: "SESSION_CREATED",
          targetType: "ATTENDANCE_SESSION",
          targetId: session.id,
          correlationId,
          afterValue: {
            status: session.status,
            attendanceDate: session.attendanceDate,
            effectiveStart: session.effectiveStartAt.toISOString(),
            effectiveEnd: session.effectiveEndAt.toISOString(),
          },
        });
        if (session.status === "OPEN") {
          await this.audit.recordWith(tx, {
            actorUserId: actorId,
            actorRole: this.actorRole(actorRoles),
            action: "SESSION_OPENED",
            targetType: "ATTENDANCE_SESSION",
            targetId: session.id,
          });
        }
        await this.enqueueLifecycleJob(tx, session);
        await this.enqueueSheetsSync(tx, session);
        return session;
      });
      return this.toResponse(created, config.timezone);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("CONFLICT", 409, "Only one attendance session may be open at a time.");
      }
      throw error;
    }
  }

  async list(status?: string) {
    const allowed = new Set(["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "CANCELLED"]);
    if (status && !allowed.has(status)) {
      throw new AppError("VALIDATION_ERROR", 400, "Enter a valid session status.");
    }
    await this.reconcileDueSessions();
    const config = await this.config.getRecord();
    const sessions = await this.db
      .select()
      .from(attendanceSessions)
      .where(status ? eq(attendanceSessions.status, status as Session["status"]) : undefined)
      .orderBy(desc(attendanceSessions.effectiveStartAt));
    return {
      items: await Promise.all(
        sessions.map((session) => this.toResponse(session, config.timezone)),
      ),
      nextCursor: null,
    };
  }

  async current() {
    await this.reconcileDueSessions();
    const config = await this.config.getRecord();
    const [session] = await this.db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.status, "OPEN"))
      .orderBy(desc(attendanceSessions.effectiveStartAt))
      .limit(1);
    return session ? this.toResponse(session, config.timezone) : null;
  }

  async detail(sessionId: string) {
    const config = await this.config.getRecord();
    const [session] = await this.db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, sessionId))
      .limit(1);
    if (!session) throw new AppError("NOT_FOUND", 404, "The attendance session was not found.");
    return this.toResponse(session, config.timezone);
  }

  async open(sessionId: string, actorId: string, actorRoles: string[], input: VersionedCommandDto) {
    const config = await this.config.getRecord();
    const now = new Date();
    try {
      const session = await this.db.transaction(async (tx) => {
        const current = await this.lockedSession(tx, sessionId, input.expectedVersion);
        if (current.status !== "DRAFT" && current.status !== "SCHEDULED") {
          throw new AppError("CONFLICT", 409, "Only a draft or scheduled session can be opened.");
        }
        if (current.effectiveStartAt > now) {
          throw new AppError("CONFLICT", 409, "This session is scheduled for a later time.");
        }
        if (current.effectiveEndAt <= now) {
          throw new AppError("CONFLICT", 409, "This session's end time has already passed.");
        }
        const [updated] = await tx
          .update(attendanceSessions)
          .set({
            status: "OPEN",
            openedByUserId: actorId,
            openedAt: now,
            version: sql`${attendanceSessions.version} + 1`,
          })
          .where(
            and(
              eq(attendanceSessions.id, sessionId),
              eq(attendanceSessions.version, input.expectedVersion),
            ),
          )
          .returning();
        if (!updated)
          throw new AppError("STALE_STATE", 409, "This session changed. Refresh and try again.");
        await this.audit.recordWith(tx, {
          actorUserId: actorId,
          actorRole: this.actorRole(actorRoles),
          action: "SESSION_OPENED",
          targetType: "ATTENDANCE_SESSION",
          targetId: sessionId,
          beforeValue: { status: current.status, version: current.version },
          afterValue: { status: updated.status, version: updated.version },
        });
        await this.enqueueLifecycleJob(tx, updated);
        await this.enqueueSheetsSync(tx, updated);
        return updated;
      });
      return this.toResponse(session, config.timezone);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("CONFLICT", 409, "Only one attendance session may be open at a time.");
      }
      throw error;
    }
  }

  async close(
    sessionId: string,
    actorId: string,
    actorRoles: string[],
    input: VersionedCommandDto,
  ) {
    return this.closeByActor(sessionId, actorId, this.actorRole(actorRoles), input.expectedVersion);
  }

  async extend(sessionId: string, actorId: string, actorRoles: string[], input: ExtendSessionDto) {
    const config = await this.config.getRecord();
    const newEnd = parsedDate(input.effectiveEnd, "effective end");
    const now = new Date();
    const role = this.actorRole(actorRoles);
    const session = await this.db.transaction(async (tx) => {
      const current = await this.lockedSession(tx, sessionId, input.expectedVersion);
      if (current.status !== "OPEN")
        throw new AppError("CONFLICT", 409, "Only an open session can be extended.");
      if (newEnd <= now || newEnd <= current.effectiveEndAt) {
        throw new AppError(
          "VALIDATION_ERROR",
          400,
          "The new session end must be later than the current end.",
        );
      }
      if (localDate(newEnd, config.timezone) !== current.attendanceDate) {
        throw new AppError(
          "VALIDATION_ERROR",
          400,
          "An extension must remain on the same local day.",
        );
      }
      const repLimit = new Date(current.originalEndAt.getTime() + 2 * 60 * 60 * 1000);
      if (role === "COURSE_REP" && newEnd > repLimit) {
        throw new AppError(
          "CONFLICT",
          409,
          "Course Representatives may extend only two hours beyond the original end.",
        );
      }
      const [updated] = await tx
        .update(attendanceSessions)
        .set({
          effectiveEndAt: newEnd,
          extendedAt: now,
          extendedByUserId: actorId,
          version: sql`${attendanceSessions.version} + 1`,
        })
        .where(
          and(
            eq(attendanceSessions.id, sessionId),
            eq(attendanceSessions.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!updated)
        throw new AppError("STALE_STATE", 409, "This session changed. Refresh and try again.");
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: role,
        action: "SESSION_EXTENDED",
        targetType: "ATTENDANCE_SESSION",
        targetId: sessionId,
        reason: input.reason,
        beforeValue: { effectiveEnd: current.effectiveEndAt.toISOString() },
        afterValue: { effectiveEnd: updated.effectiveEndAt.toISOString() },
      });
      await this.enqueueLifecycleJob(tx, updated);
      await this.rescheduleManualCaseExpiry(
        tx,
        sessionId,
        new Date(updated.effectiveEndAt.getTime() + config.manualCaseGraceMinutes * 60 * 1000),
      );
      await this.enqueueSheetsSync(tx, updated);
      return updated;
    });
    return this.toResponse(session, config.timezone);
  }

  async cancel(
    sessionId: string,
    actorId: string,
    actorRoles: string[],
    input: ReasonedVersionedCommandDto,
  ) {
    const config = await this.config.getRecord();
    const role = this.actorRole(actorRoles);
    const session = await this.db.transaction(async (tx) => {
      const current = await this.lockedSession(tx, sessionId, input.expectedVersion);
      if (current.status === "CANCELLED")
        throw new AppError("CONFLICT", 409, "This session is already cancelled.");
      if (current.status === "CLOSED" && role !== "ADMIN") {
        throw new AppError(
          "AUTHORIZATION_DENIED",
          403,
          "Only an Administrator can cancel a closed session.",
        );
      }
      if (
        current.status !== "DRAFT" &&
        current.status !== "SCHEDULED" &&
        current.status !== "OPEN" &&
        current.status !== "CLOSED"
      ) {
        throw new AppError(
          "CONFLICT",
          409,
          "This session cannot be cancelled in its current state.",
        );
      }
      const [updated] = await tx
        .update(attendanceSessions)
        .set({
          status: "CANCELLED",
          cancellationReason: input.reason,
          cancelledAt: new Date(),
          version: sql`${attendanceSessions.version} + 1`,
        })
        .where(
          and(
            eq(attendanceSessions.id, sessionId),
            eq(attendanceSessions.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!updated)
        throw new AppError("STALE_STATE", 409, "This session changed. Refresh and try again.");
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: role,
        action: "SESSION_CANCELLED",
        targetType: "ATTENDANCE_SESSION",
        targetId: sessionId,
        reason: input.reason,
        beforeValue: { status: current.status },
        afterValue: { status: updated.status },
      });
      const invalidatedCases = await tx
        .update(manualVerificationCases)
        .set({
          status: "EXPIRED",
          decidedAt: updated.cancelledAt ?? new Date(),
          version: sql`${manualVerificationCases.version} + 1`,
        })
        .where(
          and(
            eq(manualVerificationCases.sessionId, sessionId),
            eq(manualVerificationCases.status, "PENDING"),
          ),
        )
        .returning({ id: manualVerificationCases.id, version: manualVerificationCases.version });
      for (const manualCase of invalidatedCases) {
        await this.audit.recordWith(tx, {
          actorUserId: actorId,
          actorRole: role,
          action: "MANUAL_VERIFICATION_EXPIRED",
          targetType: "MANUAL_VERIFICATION_CASE",
          targetId: manualCase.id,
          reason: "The attendance session was cancelled.",
          beforeValue: { status: "PENDING" },
          afterValue: { status: "EXPIRED", version: manualCase.version },
        });
      }
      await this.enqueueSheetsSync(tx, updated);
      return updated;
    });
    return this.toResponse(session, config.timezone);
  }

  async reopen(sessionId: string, actorId: string, input: ReopenSessionDto) {
    const config = await this.config.getRecord();
    const newEnd = parsedDate(input.effectiveEnd, "effective end");
    const now = new Date();
    if (newEnd <= now) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "The reopened session must have a future closing time.",
      );
    }
    const session = await this.db.transaction(async (tx) => {
      const current = await this.lockedSession(tx, sessionId, input.expectedVersion);
      if (current.status !== "CLOSED")
        throw new AppError("CONFLICT", 409, "Only a closed session can be reopened.");
      if (localDate(newEnd, config.timezone) !== current.attendanceDate) {
        throw new AppError(
          "VALIDATION_ERROR",
          400,
          "A reopened session must remain on its attendance date.",
        );
      }
      const [updated] = await tx
        .update(attendanceSessions)
        .set({
          status: "OPEN",
          effectiveEndAt: newEnd,
          reopenedAt: now,
          reopenReason: input.reason,
          reopenCount: sql`${attendanceSessions.reopenCount} + 1`,
          version: sql`${attendanceSessions.version} + 1`,
        })
        .where(
          and(
            eq(attendanceSessions.id, sessionId),
            eq(attendanceSessions.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!updated)
        throw new AppError("STALE_STATE", 409, "This session changed. Refresh and try again.");
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: "ADMIN",
        action: "SESSION_REOPENED",
        targetType: "ATTENDANCE_SESSION",
        targetId: sessionId,
        reason: input.reason,
        beforeValue: { status: current.status, version: current.version },
        afterValue: { status: updated.status, version: updated.version },
      });
      await this.enqueueLifecycleJob(tx, updated);
      await this.enqueueSheetsSync(tx, updated);
      return updated;
    });
    return this.toResponse(session, config.timezone);
  }

  async listAttendance(sessionId: string, query?: string) {
    const [session] = await this.db
      .select({ id: attendanceSessions.id })
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, sessionId))
      .limit(1);
    if (!session) throw new AppError("NOT_FOUND", 404, "The attendance session was not found.");
    const search = query?.trim();
    const records = await this.db
      .select({ record: attendanceRecords, user: users })
      .from(attendanceRecords)
      .innerJoin(users, eq(users.id, attendanceRecords.userId))
      .where(
        search
          ? and(
              eq(attendanceRecords.sessionId, sessionId),
              or(
                ilike(users.fullName, `%${search.replace(/[%_]/g, "\\$&")}%`),
                ilike(users.participantSerial, `%${search.replace(/[%_]/g, "\\$&")}%`),
              ),
            )
          : eq(attendanceRecords.sessionId, sessionId),
      )
      .orderBy(attendanceRecords.checkedInAt);
    return {
      items: await Promise.all(records.map(async ({ record }) => this.toRecordResponse(record))),
      nextCursor: null,
    };
  }

  async processLifecycleJob(jobType: string, sessionId: string): Promise<void> {
    if (jobType === SESSION_AUTO_OPEN_JOB) {
      await this.activateDueSession(sessionId);
      return;
    }
    if (jobType === SESSION_AUTO_CLOSE_JOB) {
      await this.closeDueSession(sessionId);
      return;
    }
    throw new Error(`Unsupported attendance lifecycle job: ${jobType}`);
  }

  async reconcileDueSessions(): Promise<void> {
    const now = new Date();
    const scheduled = await this.db
      .select({ id: attendanceSessions.id })
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.status, "SCHEDULED"),
          sql`${attendanceSessions.effectiveStartAt} <= ${now}`,
        ),
      );
    await Promise.all(
      scheduled.map(async ({ id }) => {
        try {
          await this.activateDueSession(id);
        } catch (error) {
          // A still-open session may temporarily block a scheduled session. The
          // durable worker will retry it after the conflict is cleared.
          if (!(error instanceof AppError) || error.code !== "CONFLICT") throw error;
        }
      }),
    );
    const open = await this.db
      .select({ id: attendanceSessions.id })
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.status, "OPEN"),
          sql`${attendanceSessions.effectiveEndAt} <= ${now}`,
        ),
      );
    await Promise.all(open.map(({ id }) => this.closeDueSession(id)));
  }

  private async activateDueSession(sessionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = await this.lockedSession(tx, sessionId);
      const now = new Date();
      if (current.status !== "SCHEDULED" || current.effectiveStartAt > now) return;
      if (current.effectiveEndAt <= now) {
        await tx
          .update(attendanceSessions)
          .set({ status: "CLOSED", closedAt: now, version: sql`${attendanceSessions.version} + 1` })
          .where(
            and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.status, "SCHEDULED")),
          );
        await this.audit.recordWith(tx, {
          actorRole: "SYSTEM",
          action: "SESSION_AUTO_CLOSED",
          targetType: "ATTENDANCE_SESSION",
          targetId: sessionId,
        });
        return;
      }
      try {
        const [updated] = await tx
          .update(attendanceSessions)
          .set({
            status: "OPEN",
            openedAt: now,
            version: sql`${attendanceSessions.version} + 1`,
          })
          .where(
            and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.status, "SCHEDULED")),
          )
          .returning();
        if (!updated) return;
        await this.audit.recordWith(tx, {
          actorRole: "SYSTEM",
          action: "SESSION_AUTO_OPENED",
          targetType: "ATTENDANCE_SESSION",
          targetId: sessionId,
        });
        await this.enqueueLifecycleJob(tx, updated);
      } catch (error) {
        if (isUniqueViolation(error))
          throw new AppError("CONFLICT", 409, "Only one attendance session may be open at a time.");
        throw error;
      }
    });
  }

  private async closeDueSession(sessionId: string): Promise<void> {
    const config = await this.config.getRecord();
    await this.db.transaction(async (tx) => {
      const current = await this.lockedSession(tx, sessionId);
      const now = new Date();
      if (current.status !== "OPEN" || current.effectiveEndAt > now) return;
      const [updated] = await tx
        .update(attendanceSessions)
        .set({
          status: "CLOSED",
          closedAt: now,
          closedByUserId: null,
          version: sql`${attendanceSessions.version} + 1`,
        })
        .where(and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.status, "OPEN")))
        .returning();
      if (!updated) return;
      await this.audit.recordWith(tx, {
        actorRole: "SYSTEM",
        action: "SESSION_AUTO_CLOSED",
        targetType: "ATTENDANCE_SESSION",
        targetId: sessionId,
        beforeValue: { status: current.status, effectiveEnd: current.effectiveEndAt.toISOString() },
        afterValue: { status: updated.status, closedAt: updated.closedAt?.toISOString() },
      });
      await this.rescheduleManualCaseExpiry(
        tx,
        sessionId,
        new Date(now.getTime() + config.manualCaseGraceMinutes * 60 * 1000),
      );
      await this.enqueueSheetsSync(tx, updated);
    });
  }

  private async rescheduleManualCaseExpiry(
    db: DatabaseClient,
    sessionId: string,
    expiresAt: Date,
  ): Promise<void> {
    const pending = await db
      .select({ id: manualVerificationCases.id, expiresAt: manualVerificationCases.expiresAt })
      .from(manualVerificationCases)
      .where(
        and(
          eq(manualVerificationCases.sessionId, sessionId),
          eq(manualVerificationCases.status, "PENDING"),
        ),
      );
    for (const manualCase of pending) {
      if (manualCase.expiresAt.getTime() === expiresAt.getTime()) continue;
      await db
        .update(manualVerificationCases)
        .set({ expiresAt })
        .where(
          and(
            eq(manualVerificationCases.id, manualCase.id),
            eq(manualVerificationCases.status, "PENDING"),
          ),
        );
      await this.jobs.enqueueWith(db, {
        jobType: MANUAL_CASE_EXPIRE_JOB,
        sourceKey: `manual-case-expire:${manualCase.id}:${expiresAt.toISOString()}`,
        payload: { caseId: manualCase.id },
        runAfter: expiresAt,
      });
    }
  }

  private async closeByActor(
    sessionId: string,
    actorId: string | undefined,
    actorRole: ActorRole,
    expectedVersion: number,
  ) {
    const config = await this.config.getRecord();
    const session = await this.db.transaction(async (tx) => {
      const current = await this.lockedSession(tx, sessionId, expectedVersion);
      if (current.status !== "OPEN")
        throw new AppError("CONFLICT", 409, "Only an open session can be closed.");
      const now = new Date();
      const [updated] = await tx
        .update(attendanceSessions)
        .set({
          status: "CLOSED",
          closedAt: now,
          closedByUserId: actorId ?? null,
          version: sql`${attendanceSessions.version} + 1`,
        })
        .where(
          and(
            eq(attendanceSessions.id, sessionId),
            eq(attendanceSessions.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated)
        throw new AppError("STALE_STATE", 409, "This session changed. Refresh and try again.");
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole,
        action: actorRole === "SYSTEM" ? "SESSION_AUTO_CLOSED" : "SESSION_CLOSED",
        targetType: "ATTENDANCE_SESSION",
        targetId: sessionId,
        beforeValue: { status: current.status },
        afterValue: { status: updated.status },
      });
      await this.rescheduleManualCaseExpiry(
        tx,
        sessionId,
        new Date(now.getTime() + config.manualCaseGraceMinutes * 60 * 1000),
      );
      await this.enqueueSheetsSync(tx, updated);
      return updated;
    });
    return this.toResponse(session, config.timezone);
  }

  private async lockedSession(
    db: DatabaseClient,
    sessionId: string,
    expectedVersion?: number,
  ): Promise<Session> {
    const [session] = await db
      .select()
      .from(attendanceSessions)
      .where(
        expectedVersion === undefined
          ? eq(attendanceSessions.id, sessionId)
          : and(
              eq(attendanceSessions.id, sessionId),
              eq(attendanceSessions.version, expectedVersion),
            ),
      )
      .for("update")
      .limit(1);
    if (!session) {
      throw new AppError(
        expectedVersion === undefined ? "NOT_FOUND" : "STALE_STATE",
        expectedVersion === undefined ? 404 : 409,
        expectedVersion === undefined
          ? "The attendance session was not found."
          : "This session changed. Refresh and try again.",
      );
    }
    return session;
  }

  private async enqueueLifecycleJob(db: DatabaseClient, session: Session): Promise<void> {
    if (session.status === "SCHEDULED") {
      await this.jobs.enqueueWith(db, {
        jobType: SESSION_AUTO_OPEN_JOB,
        sourceKey: `session-open:${session.id}:${session.effectiveStartAt.toISOString()}`,
        payload: { sessionId: session.id },
        runAfter: session.effectiveStartAt,
      });
    }
    if (session.status === "OPEN") {
      await this.jobs.enqueueWith(db, {
        jobType: SESSION_AUTO_CLOSE_JOB,
        sourceKey: `session-close:${session.id}:${session.effectiveEndAt.toISOString()}`,
        payload: { sessionId: session.id },
        runAfter: session.effectiveEndAt,
      });
    }
  }

  private async enqueueSheetsSync(db: DatabaseClient, session: Session): Promise<void> {
    await this.jobs.enqueueWith(db, {
      jobType: ATTENDANCE_SHEETS_SYNC_JOB,
      sourceKey: `sheets-session:${session.id}:${session.version}`,
      payload: { sessionId: session.id },
    });
  }

  async toResponse(session: Session, timezone: string) {
    const [present] = await this.db
      .select({ count: count() })
      .from(attendanceRecords)
      .where(
        and(eq(attendanceRecords.sessionId, session.id), eq(attendanceRecords.status, "PRESENT")),
      );
    return {
      id: session.id,
      attendanceDate: session.attendanceDate,
      effectiveStart: session.effectiveStartAt.toISOString(),
      originalEffectiveEnd: session.originalEndAt.toISOString(),
      effectiveEnd: session.effectiveEndAt.toISOString(),
      timezone,
      status: session.status,
      version: session.version,
      openedAt: session.openedAt?.toISOString() ?? null,
      openedBy: session.openedByUserId,
      closedAt: session.closedAt?.toISOString() ?? null,
      closedBy: session.closedByUserId ?? (session.status === "CLOSED" ? "SYSTEM" : null),
      cancelledAt: session.cancelledAt?.toISOString() ?? null,
      extendedAt: session.extendedAt?.toISOString() ?? null,
      extendedBy: session.extendedByUserId,
      reopenedAt: session.reopenedAt?.toISOString() ?? null,
      reopenCount: session.reopenCount,
      presentCount: Number(present?.count ?? 0),
      createdAt: session.createdAt.toISOString(),
    };
  }

  private async toRecordResponse(record: typeof attendanceRecords.$inferSelect) {
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

  private assertWindow(start: Date, end: Date): void {
    if (end <= start)
      throw new AppError("VALIDATION_ERROR", 400, "The session end must be after its start.");
  }

  private actorRole(roles: string[]): ActorRole {
    if (roles.includes("ADMIN")) return "ADMIN";
    if (roles.includes("COURSE_REP")) return "COURSE_REP";
    return "COURSE_REP";
  }
}
