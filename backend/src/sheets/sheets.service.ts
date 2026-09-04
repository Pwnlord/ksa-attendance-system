import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.module";
import {
  attendanceRecords,
  attendanceSessions,
  backgroundJobs,
  courseConfig,
  roleAssignments,
  rosterEntries,
  users,
} from "../database/schema";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../identity/audit.service";
import { JOB_QUEUE, JobQueue } from "../infrastructure/jobs/job-queue.port";
import { ATTENDANCE_SHEETS_SYNC_JOB } from "../attendance/job-types";
import {
  applicableAttendanceStatus,
  attendancePercentage,
  safeSheetValue,
  sessionTabTitle,
} from "./reporting";
import { SheetsReconcileDto } from "./dto/sheets.dto";
import { SHEETS_RECONCILE_JOB, SheetsReconcileScope } from "./sheets-job-types";
import { SHEETS_PROVIDER, SheetTab, SheetsProvider } from "./sheets-provider.port";

type Session = typeof attendanceSessions.$inferSelect;
type ProjectionRow = {
  roster: typeof rosterEntries.$inferSelect | null;
  user: typeof users.$inferSelect | null;
  enrollmentEffectiveDate: string;
  attendanceRosterStatus: "UNCLAIMED" | "CLAIMED" | "DISABLED";
};
const projectionJobTypes = [ATTENDANCE_SHEETS_SYNC_JOB, SHEETS_RECONCILE_JOB];
const retryableStatuses: Array<"PENDING" | "RETRY_SCHEDULED"> = ["PENDING", "RETRY_SCHEDULED"];
const reportStatuses: Array<"PENDING" | "RUNNING" | "RETRY_SCHEDULED"> = [
  "PENDING",
  "RUNNING",
  "RETRY_SCHEDULED",
];

function idempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 16 || key.length > 200) {
    throw new AppError("VALIDATION_ERROR", 400, "Provide a valid Idempotency-Key header.");
  }
  return key;
}

function stringPayload(payload: unknown, field: string): string {
  if (!payload || typeof payload !== "object") throw new Error(`Sheets job is missing ${field}.`);
  const value = (payload as Record<string, unknown>)[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Sheets job is missing ${field}.`);
  }
  return value;
}

function scopePayload(payload: unknown): SheetsReconcileScope {
  const value = stringPayload(payload, "scope");
  if (!["MASTER_REGISTER", "SESSION", "SUMMARY", "FULL"].includes(value)) {
    throw new Error("Sheets reconciliation has an invalid scope.");
  }
  return value as SheetsReconcileScope;
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

@Injectable()
export class SheetsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(SHEETS_PROVIDER) private readonly provider: SheetsProvider,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async health() {
    const [pending] = await this.db
      .select({ value: count() })
      .from(backgroundJobs)
      .where(
        and(
          inArray(backgroundJobs.jobType, projectionJobTypes),
          inArray(backgroundJobs.status, reportStatuses),
        ),
      );
    const [failed] = await this.db
      .select({ value: count() })
      .from(backgroundJobs)
      .where(
        and(
          inArray(backgroundJobs.jobType, projectionJobTypes),
          eq(backgroundJobs.status, "FAILED"),
        ),
      );
    const [running] = await this.db
      .select({ value: count() })
      .from(backgroundJobs)
      .where(
        and(
          inArray(backgroundJobs.jobType, projectionJobTypes),
          eq(backgroundJobs.status, "RUNNING"),
        ),
      );
    const [lastSuccess] = await this.db
      .select({ completedAt: backgroundJobs.completedAt })
      .from(backgroundJobs)
      .where(
        and(
          inArray(backgroundJobs.jobType, projectionJobTypes),
          eq(backgroundJobs.status, "SUCCEEDED"),
        ),
      )
      .orderBy(desc(backgroundJobs.completedAt))
      .limit(1);
    const [lastFailure] = await this.db
      .select({ lastError: backgroundJobs.lastError })
      .from(backgroundJobs)
      .where(
        and(
          inArray(backgroundJobs.jobType, projectionJobTypes),
          eq(backgroundJobs.status, "FAILED"),
        ),
      )
      .orderBy(desc(backgroundJobs.updatedAt))
      .limit(1);

    const pendingCount = Number(pending?.value ?? 0);
    const failedCount = Number(failed?.value ?? 0);
    return {
      status: failedCount > 0 ? "UNAVAILABLE" : pendingCount > 0 ? "DEGRADED" : "HEALTHY",
      workerStatus: Number(running?.value ?? 0) > 0 || pendingCount === 0 ? "HEALTHY" : "STALE",
      pendingCount,
      failedCount,
      lastSuccessfulSyncAt: lastSuccess?.completedAt?.toISOString() ?? null,
      lastSanitizedError: lastFailure?.lastError
        ? lastFailure.lastError.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500)
        : null,
      provider: this.config.get<string>("app.sheets.driver", "memory"),
    };
  }

  async retry(actorId: string, jobIds?: string[]) {
    const now = new Date();
    const result = await this.db.transaction(async (tx) => {
      const conditions = [
        inArray(backgroundJobs.jobType, projectionJobTypes),
        inArray(backgroundJobs.status, ["FAILED", ...retryableStatuses]),
      ];
      if (jobIds && jobIds.length > 0) conditions.push(inArray(backgroundJobs.id, jobIds));
      const selected = await tx
        .select({ id: backgroundJobs.id })
        .from(backgroundJobs)
        .where(and(...conditions))
        .for("update");
      if (selected.length > 0) {
        await tx
          .update(backgroundJobs)
          .set({
            status: "PENDING",
            attempts: 0,
            runAfter: now,
            lockedAt: null,
            lockedBy: null,
            lastError: null,
            completedAt: null,
            updatedAt: now,
          })
          .where(
            inArray(
              backgroundJobs.id,
              selected.map((job) => job.id),
            ),
          );
      }
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: "ADMIN",
        action: "SHEETS_SYNC_RETRIED",
        targetType: "SHEETS_PROJECTION",
        reason: "Administrator requested a retry of Sheets projection jobs.",
        afterValue: { queuedCount: selected.length },
      });
      return selected.map((job) => job.id);
    });
    return { queuedCount: result.length, jobIds: result };
  }

  async reconcile(actorId: string, input: SheetsReconcileDto, key: string) {
    const requestKey = idempotencyKey(key);
    if (input.scope === "SESSION" && !input.sessionId) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "A session is required for session reconciliation.",
      );
    }
    if (input.scope !== "SESSION" && input.sessionId) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "A session is only valid for session reconciliation.",
      );
    }
    if (input.sessionId) {
      const [session] = await this.db
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, input.sessionId))
        .limit(1);
      if (!session) throw new AppError("NOT_FOUND", 404, "The attendance session was not found.");
    }
    const result = await this.db.transaction(async (tx) => {
      const sourceKey = `sheets-reconcile:${input.scope}:${input.sessionId ?? "all"}:${requestKey}`;
      const job = await this.jobs.enqueueWith(tx, {
        jobType: SHEETS_RECONCILE_JOB,
        sourceKey,
        payload: { scope: input.scope, sessionId: input.sessionId ?? null },
      });
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: "ADMIN",
        action: "SHEETS_RECONCILIATION_REQUESTED",
        targetType: "SHEETS_PROJECTION",
        targetId: job.id,
        reason: input.reason,
        afterValue: { scope: input.scope, sessionId: input.sessionId ?? null },
      });
      return job;
    });
    return { jobId: result.id, status: result.status, scope: input.scope };
  }

  async processJob(jobType: string, payload: unknown): Promise<void> {
    if (jobType === ATTENDANCE_SHEETS_SYNC_JOB) {
      const sessionId = stringPayload(payload, "sessionId");
      await this.syncSession(sessionId);
      await this.syncSummary();
      return;
    }
    if (jobType !== SHEETS_RECONCILE_JOB) throw new Error(`Unsupported Sheets job: ${jobType}`);
    const scope = scopePayload(payload);
    const sessionId =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).sessionId === "string"
        ? ((payload as Record<string, unknown>).sessionId as string)
        : undefined;
    if (scope === "FULL") {
      await this.syncFull();
      return;
    }
    if (scope === "MASTER_REGISTER") await this.syncMasterRegister();
    if (scope === "SESSION") {
      if (!sessionId) throw new Error("Session reconciliation is missing a session ID.");
      await this.syncSession(sessionId);
    }
    if (scope === "SUMMARY") await this.syncSummary();
  }

  async syncMasterRegister(): Promise<void> {
    await this.provider.replaceTabs([await this.masterTab()]);
  }

  async syncSession(sessionId: string): Promise<void> {
    const [session] = await this.db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, sessionId))
      .limit(1);
    if (!session) throw new Error("The attendance session for Sheets projection was not found.");
    const tab = await this.buildSessionTab(session, await this.tabTitleForSession(session));
    await this.provider.replaceTabs([tab]);
  }

  async syncSummary(): Promise<void> {
    const [tab] = await this.summaryTabs();
    await this.provider.replaceTabs([tab]);
  }

  async syncFull(): Promise<void> {
    const tabs = await this.sessionTabs(
      await this.db
        .select()
        .from(attendanceSessions)
        .orderBy(
          asc(attendanceSessions.attendanceDate),
          asc(attendanceSessions.effectiveStartAt),
          asc(attendanceSessions.id),
        ),
    );
    const [master, summary] = await Promise.all([this.masterTab(), this.summaryTab()]);
    await this.provider.replaceTabs([master, ...tabs, summary]);
  }

  private async participantRows(): Promise<ProjectionRow[]> {
    const [config] = await this.db
      .select({
        id: courseConfig.id,
        timezone: courseConfig.timezone,
        registrationMode: courseConfig.registrationMode,
      })
      .from(courseConfig)
      .where(eq(courseConfig.singletonKey, "default"))
      .limit(1);
    if (!config) throw new Error("Course configuration is not initialized.");
    const rosterRows = await this.db
      .select({ roster: rosterEntries, user: users })
      .from(rosterEntries)
      .leftJoin(users, eq(users.id, rosterEntries.claimedUserId))
      .where(eq(rosterEntries.courseConfigId, config.id))
      .orderBy(asc(rosterEntries.serial));

    const participantUsers = await this.db
      .select({ user: users })
      .from(users)
      .innerJoin(
        roleAssignments,
        and(
          eq(roleAssignments.userId, users.id),
          eq(roleAssignments.role, "PARTICIPANT"),
          isNull(roleAssignments.revokedAt),
        ),
      )
      .orderBy(asc(users.participantSerial), asc(users.fullName));

    const sourceRosterRows =
      config.registrationMode === "OPEN_REGISTRATION"
        ? rosterRows.filter(({ roster }) => roster.status !== "UNCLAIMED")
        : rosterRows;
    const seenUserIds = new Set<string>();
    const rows: ProjectionRow[] = sourceRosterRows.map(({ roster, user }) => {
      if (user) seenUserIds.add(user.id);
      return {
        roster,
        user,
        enrollmentEffectiveDate: roster.enrollmentEffectiveDate,
        attendanceRosterStatus: roster.status,
      };
    });

    for (const { user } of participantUsers) {
      if (seenUserIds.has(user.id)) continue;
      rows.push({
        roster: null,
        user,
        enrollmentEffectiveDate: localDate(user.createdAt, config.timezone),
        attendanceRosterStatus: user.accountStatus === "ACTIVE" ? "CLAIMED" : "DISABLED",
      });
    }

    return rows.sort((left, right) => {
      const leftSerial = left.user?.participantSerial ?? left.roster?.serial ?? "";
      const rightSerial = right.user?.participantSerial ?? right.roster?.serial ?? "";
      return (
        leftSerial.localeCompare(rightSerial) ||
        (left.user?.fullName ?? left.roster?.normalizedName ?? "").localeCompare(
          right.user?.fullName ?? right.roster?.normalizedName ?? "",
        )
      );
    });
  }

  private async sessionTabs(sessions: Session[]): Promise<SheetTab[]> {
    const occurrences = new Map<string, number>();
    const tabs: SheetTab[] = [];
    for (const session of sessions) {
      const occurrence = (occurrences.get(session.attendanceDate) ?? 0) + 1;
      occurrences.set(session.attendanceDate, occurrence);
      tabs.push(
        await this.buildSessionTab(session, sessionTabTitle(session.attendanceDate, occurrence)),
      );
    }
    return tabs;
  }

  private async tabTitleForSession(session: Session): Promise<string> {
    const sameDate = await this.db
      .select({ id: attendanceSessions.id })
      .from(attendanceSessions)
      .where(eq(attendanceSessions.attendanceDate, session.attendanceDate))
      .orderBy(asc(attendanceSessions.effectiveStartAt), asc(attendanceSessions.id));
    const occurrence = sameDate.findIndex(({ id }) => id === session.id) + 1;
    if (occurrence < 1) throw new Error("The attendance session tab could not be located.");
    return sessionTabTitle(session.attendanceDate, occurrence);
  }

  private async buildSessionTab(session: Session, title: string): Promise<SheetTab> {
    const [rows, records] = await Promise.all([
      this.participantRows(),
      this.db.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, session.id)),
    ]);
    const recordsByUser = new Map(records.map((record) => [record.userId, record]));
    const values: string[][] = [
      ["Kora Sales Academy — Attendance Session"],
      [
        "Session Date",
        safeSheetValue(session.attendanceDate),
        "Session Status",
        safeSheetValue(session.status),
      ],
      [
        "Effective Start",
        safeSheetValue(session.effectiveStartAt.toISOString()),
        "Effective End",
        safeSheetValue(session.effectiveEndAt.toISOString()),
      ],
      [],
      [
        "Participant Serial",
        "Participant Name",
        "Attendance Status",
        "Method",
        "Checked In At",
        "Enrollment Effective Date",
        "Roster Status",
      ],
    ];
    if (session.status === "CANCELLED") values[1].push("CANCELLED — excluded from Summary");
    values.push(
      ...rows.map(({ roster, user, enrollmentEffectiveDate, attendanceRosterStatus }) => {
        const record = user ? recordsByUser.get(user.id) : undefined;
        const status = applicableAttendanceStatus({
          sessionStatus: session.status,
          attendanceDate: session.attendanceDate,
          enrollmentEffectiveDate,
          rosterStatus: attendanceRosterStatus,
          recordStatus: record?.status,
        });
        return [
          safeSheetValue(user?.participantSerial ?? roster?.serial),
          safeSheetValue(user?.fullName ?? roster?.normalizedName),
          safeSheetValue(status),
          safeSheetValue(
            record?.method === "CORRECTION"
              ? "Manual Correction"
              : record?.method === "MANUAL"
                ? "Manual Approval"
                : record?.method,
          ),
          safeSheetValue(record?.checkedInAt?.toISOString()),
          safeSheetValue(enrollmentEffectiveDate),
          safeSheetValue(roster?.status ?? "OPEN_REGISTRATION"),
        ];
      }),
    );
    return { title, values };
  }

  private async masterTab(): Promise<SheetTab> {
    const rows = await this.participantRows();
    return {
      title: "Master Register",
      values: [
        ["Kora Sales Academy — Master Register"],
        [],
        [
          "Participant Serial",
          "Participant Name",
          "Email",
          "Phone",
          "Enrollment Effective Date",
          "Roster Status",
          "Account Status",
          "Registered At",
        ],
        ...rows.map(({ roster, user, enrollmentEffectiveDate }) => [
          safeSheetValue(user?.participantSerial ?? roster?.serial),
          safeSheetValue(user?.fullName ?? roster?.normalizedName),
          safeSheetValue(user?.normalizedEmail ?? roster?.normalizedEmail),
          safeSheetValue(user?.normalizedPhone ?? roster?.normalizedPhone),
          safeSheetValue(enrollmentEffectiveDate),
          safeSheetValue(roster?.status ?? "OPEN_REGISTRATION"),
          safeSheetValue(user?.accountStatus ?? "NOT_REGISTERED"),
          safeSheetValue(user?.createdAt?.toISOString()),
        ]),
      ],
    };
  }

  private async summaryTabs(): Promise<SheetTab[]> {
    return [await this.summaryTab()];
  }

  private async summaryTab(): Promise<SheetTab> {
    const sessions = await this.db
      .select()
      .from(attendanceSessions)
      .where(sql`${attendanceSessions.status} <> 'CANCELLED'`)
      .orderBy(
        asc(attendanceSessions.attendanceDate),
        asc(attendanceSessions.effectiveStartAt),
        asc(attendanceSessions.id),
      );
    const rows = await this.participantRows();
    const sessionOccurrences = new Map<string, number>();
    const titles = sessions.map((session) => {
      const occurrence = (sessionOccurrences.get(session.attendanceDate) ?? 0) + 1;
      sessionOccurrences.set(session.attendanceDate, occurrence);
      return sessionTabTitle(session.attendanceDate, occurrence);
    });
    const records = sessions.length
      ? await this.db
          .select()
          .from(attendanceRecords)
          .where(
            inArray(
              attendanceRecords.sessionId,
              sessions.map((session) => session.id),
            ),
          )
      : [];
    const recordsBySessionUser = new Map(
      records.map((record) => [`${record.sessionId}:${record.userId}`, record]),
    );
    return {
      title: "Summary",
      values: [
        ["Kora Sales Academy — Summary"],
        [],
        [
          "Participant Serial",
          "Participant Name",
          "Enrollment Effective Date",
          ...titles,
          "Attendance Percentage",
        ],
        ...rows.map(({ roster, user, enrollmentEffectiveDate, attendanceRosterStatus }) => {
          const statuses = sessions.map((session) =>
            applicableAttendanceStatus({
              sessionStatus: session.status,
              attendanceDate: session.attendanceDate,
              enrollmentEffectiveDate,
              rosterStatus: attendanceRosterStatus,
              recordStatus: user
                ? recordsBySessionUser.get(`${session.id}:${user.id}`)?.status
                : undefined,
            }),
          );
          return [
            safeSheetValue(user?.participantSerial ?? roster?.serial),
            safeSheetValue(user?.fullName ?? roster?.normalizedName),
            safeSheetValue(enrollmentEffectiveDate),
            ...statuses.map(safeSheetValue),
            safeSheetValue(attendancePercentage(statuses)),
          ];
        }),
      ],
    };
  }
}
