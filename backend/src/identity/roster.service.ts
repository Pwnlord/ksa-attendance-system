import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.module";
import { courseConfig, rosterEntries } from "../database/schema";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "./audit.service";
import { JOB_QUEUE, JobQueue } from "../infrastructure/jobs/job-queue.port";
import { SHEETS_RECONCILE_JOB } from "../sheets/sheets-job-types";
import { RosterEntryUpdateDto } from "./dto/admin.dto";
import {
  isValidPhone,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeSerial,
} from "./normalization";

interface RosterCsvRow {
  serial?: string;
  serialnumber?: string;
  name?: string;
  fullname?: string;
  email?: string;
  phone?: string;
  enrollmenteffectivedate?: string;
}

export interface RosterListQuery {
  status?: "UNCLAIMED" | "CLAIMED" | "DISABLED";
  query?: string;
  limit?: number;
}

@Injectable()
export class RosterService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  async importCsv(file: Buffer | undefined, actorId: string, reason: string) {
    if (reason.trim().length < 3 || reason.trim().length > 1000) {
      throw new AppError("VALIDATION_ERROR", 400, "Provide a clear reason for this roster import.");
    }
    if (!file || file.length === 0 || file.length > 5 * 1024 * 1024) {
      throw new AppError("VALIDATION_ERROR", 400, "Upload a roster CSV smaller than 5 MB.");
    }
    const records = this.parseRows(file);
    const normalized = records.map((row, index) => this.normalizeRow(row, index + 2));
    const serials = new Set<string>();
    const emails = new Set<string>();
    const phones = new Set<string>();
    for (const row of normalized) {
      if (
        serials.has(row.serial) ||
        (row.email && emails.has(row.email)) ||
        (row.phone && phones.has(row.phone))
      ) {
        throw new AppError(
          "ROSTER_IMPORT_INVALID",
          400,
          "The CSV contains duplicate identity values.",
        );
      }
      serials.add(row.serial);
      if (row.email) emails.add(row.email);
      if (row.phone) phones.add(row.phone);
    }

    const config = await this.defaultCourseConfig();
    const importId = randomUUID();
    let createdCount = 0;
    let updatedCount = 0;
    await this.db.transaction(async (tx) => {
      for (const row of normalized) {
        const [existing] = await tx
          .select()
          .from(rosterEntries)
          .where(
            and(eq(rosterEntries.courseConfigId, config.id), eq(rosterEntries.serial, row.serial)),
          )
          .for("update")
          .limit(1);
        if (!existing) {
          await tx.insert(rosterEntries).values({
            courseConfigId: config.id,
            serial: row.serial,
            normalizedName: row.fullName,
            normalizedEmail: row.email,
            normalizedPhone: row.phone,
            enrollmentEffectiveDate: row.enrollmentEffectiveDate,
            importBatchId: importId,
          });
          createdCount += 1;
          continue;
        }
        await tx
          .update(rosterEntries)
          .set({
            normalizedName: row.fullName,
            normalizedEmail: row.email,
            normalizedPhone: row.phone,
            enrollmentEffectiveDate: row.enrollmentEffectiveDate,
            importBatchId: importId,
            updatedAt: new Date(),
            version: sql`${rosterEntries.version} + 1`,
          })
          .where(eq(rosterEntries.id, existing.id));
        updatedCount += 1;
      }
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: "ADMIN",
        action: "ROSTER_IMPORTED",
        targetType: "ROSTER_IMPORT",
        reason,
        afterValue: { importId, createdCount, updatedCount },
      });
      await this.jobs.enqueueWith(tx, {
        jobType: SHEETS_RECONCILE_JOB,
        sourceKey: `sheets-master-register:import:${importId}`,
        payload: { scope: "MASTER_REGISTER" },
      });
    });
    return { importId, createdCount, updatedCount, skippedCount: 0, warnings: [] as string[] };
  }

  async list(query: RosterListQuery) {
    const conditions = [];
    if (query.status) conditions.push(eq(rosterEntries.status, query.status));
    if (query.query?.trim()) {
      const search = `%${query.query.trim().replace(/[%_]/g, "\\$&")}%`;
      conditions.push(
        or(
          ilike(rosterEntries.serial, search),
          ilike(rosterEntries.normalizedName, search),
          ilike(rosterEntries.normalizedEmail, search),
          ilike(rosterEntries.normalizedPhone, search),
        ),
      );
    }
    const entries = await this.db
      .select()
      .from(rosterEntries)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(Math.min(Math.max(query.limit ?? 50, 1), 100));
    return { items: entries.map(toRosterEntry), nextCursor: null };
  }

  async update(id: string, input: RosterEntryUpdateDto, actorId: string) {
    const [existing] = await this.db
      .select()
      .from(rosterEntries)
      .where(eq(rosterEntries.id, id))
      .limit(1);
    if (!existing || existing.version !== input.expectedVersion) {
      throw new AppError("STALE_STATE", 409, "This roster entry changed. Refresh and try again.");
    }
    if (existing.status === "CLAIMED" && input.status === "UNCLAIMED") {
      throw new AppError("CONFLICT", 409, "A claimed roster entry cannot be silently unclaimed.");
    }
    if (input.status === "CLAIMED" && !existing.claimedUserId) {
      throw new AppError(
        "CONFLICT",
        409,
        "A roster entry can become claimed only through registration.",
      );
    }
    if (
      !input.fullName &&
      input.email === undefined &&
      input.phone === undefined &&
      !input.enrollmentEffectiveDate &&
      !input.status
    ) {
      throw new AppError("VALIDATION_ERROR", 400, "Provide at least one roster field to update.");
    }
    const fullName = input.fullName ? normalizeName(input.fullName) : undefined;
    const email =
      input.email === undefined ? undefined : input.email ? normalizeEmail(input.email) : null;
    const phone =
      input.phone === undefined ? undefined : input.phone ? normalizePhone(input.phone) : null;
    if (phone && !isValidPhone(phone))
      throw new AppError("VALIDATION_ERROR", 400, "Enter a valid phone number.");
    const [updated] = await this.db
      .update(rosterEntries)
      .set({
        ...(fullName ? { normalizedName: fullName } : {}),
        ...(email !== undefined ? { normalizedEmail: email } : {}),
        ...(phone !== undefined ? { normalizedPhone: phone } : {}),
        ...(input.enrollmentEffectiveDate
          ? { enrollmentEffectiveDate: input.enrollmentEffectiveDate }
          : {}),
        ...(input.status ? { status: input.status } : {}),
        version: sql`${rosterEntries.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(rosterEntries.id, id), eq(rosterEntries.version, input.expectedVersion)))
      .returning();
    if (!updated)
      throw new AppError("STALE_STATE", 409, "This roster entry changed. Refresh and try again.");
    await this.audit.record({
      actorUserId: actorId,
      actorRole: "ADMIN",
      action: "ROSTER_ENTRY_UPDATED",
      targetType: "ROSTER_ENTRY",
      targetId: id,
      reason: input.reason,
      beforeValue: { status: existing.status, version: existing.version },
      afterValue: { status: updated.status, version: updated.version },
    });
    await this.jobs.enqueue({
      jobType: SHEETS_RECONCILE_JOB,
      sourceKey: `sheets-master-register:entry:${updated.id}:${updated.version}`,
      payload: { scope: "MASTER_REGISTER" },
    });
    return toRosterEntry(updated);
  }

  private parseRows(file: Buffer): RosterCsvRow[] {
    try {
      const rows = parse(file.toString("utf8"), {
        columns: (headers: string[]) =>
          headers.map((header) =>
            header
              .replace(/^\uFEFF/, "")
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]/g, ""),
          ),
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: false,
      }) as RosterCsvRow[];
      if (rows.length === 0) throw new Error("empty");
      if (
        !rows.some((row) => row.serial || row.serialnumber) ||
        !rows.some((row) => row.name || row.fullname)
      )
        throw new Error("headers");
      return rows;
    } catch {
      throw new AppError(
        "ROSTER_IMPORT_INVALID",
        400,
        "The roster CSV could not be read. Check its headers and rows.",
      );
    }
  }

  private normalizeRow(row: RosterCsvRow, line: number) {
    try {
      const serial = normalizeSerial(row.serial ?? row.serialnumber ?? "");
      const fullName = normalizeName(row.name ?? row.fullname ?? "");
      const email = row.email ? normalizeEmail(row.email) : null;
      const phone = row.phone ? normalizePhone(row.phone) : null;
      const enrollmentEffectiveDate = row.enrollmenteffectivedate?.trim() ?? "";
      if (
        fullName.length < 2 ||
        (!email && !phone) ||
        (phone && !isValidPhone(phone)) ||
        !isIsoDate(enrollmentEffectiveDate)
      )
        throw new Error("values");
      return { serial, fullName, email, phone, enrollmentEffectiveDate };
    } catch {
      throw new AppError(
        "ROSTER_IMPORT_INVALID",
        400,
        `The roster CSV has invalid values on line ${line}.`,
      );
    }
  }

  private async defaultCourseConfig() {
    const [config] = await this.db
      .select()
      .from(courseConfig)
      .where(eq(courseConfig.singletonKey, "default"))
      .limit(1);
    if (!config)
      throw new AppError(
        "COURSE_NOT_CONFIGURED",
        409,
        "Configure the course before importing a roster.",
      );
    return config;
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toRosterEntry(entry: typeof rosterEntries.$inferSelect) {
  return {
    id: entry.id,
    serialNumber: entry.serial,
    fullName: entry.normalizedName,
    email: entry.normalizedEmail,
    phone: entry.normalizedPhone,
    enrollmentEffectiveDate: entry.enrollmentEffectiveDate,
    status: entry.status,
    claimedByUserId: entry.claimedUserId,
    claimedAt: entry.claimedAt,
    version: entry.version,
    createdAt: entry.createdAt,
  };
}
