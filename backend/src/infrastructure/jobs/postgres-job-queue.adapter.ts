import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { BackgroundJob } from "../../database/schema";
import { backgroundJobs } from "../../database/schema";
import { DATABASE } from "../../database/database.constants";
import type { Database, DatabaseClient } from "../../database/database.module";
import { EnqueueJobInput, JobQueue } from "./job-queue.port";

const maximumAttempts = 10;

function safeJobError(error: string): string {
  return error
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 500);
}

@Injectable()
export class PostgresJobQueue implements JobQueue {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async enqueue(input: EnqueueJobInput): Promise<Pick<BackgroundJob, "id" | "status">> {
    return this.enqueueWith(this.db, input);
  }

  async enqueueWith(
    db: DatabaseClient,
    input: EnqueueJobInput,
  ): Promise<Pick<BackgroundJob, "id" | "status">> {
    const [created] = await db
      .insert(backgroundJobs)
      .values({
        jobType: input.jobType,
        sourceKey: input.sourceKey,
        payload: input.payload,
        runAfter: input.runAfter ?? new Date(),
      })
      .onConflictDoNothing({ target: backgroundJobs.sourceKey })
      .returning({ id: backgroundJobs.id, status: backgroundJobs.status });

    if (created) return created;

    const [existing] = await db
      .select({ id: backgroundJobs.id, status: backgroundJobs.status })
      .from(backgroundJobs)
      .where(eq(backgroundJobs.sourceKey, input.sourceKey))
      .limit(1);

    if (!existing) throw new Error("Durable job enqueue did not return a job.");
    return existing;
  }

  async claimBatch(
    workerId: string,
    limit: number,
    jobTypes?: readonly string[],
  ): Promise<BackgroundJob[]> {
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const typeFilter =
      jobTypes && jobTypes.length > 0
        ? sql`AND job_type IN (${sql.join(
            jobTypes.map((jobType) => sql`${jobType}`),
            sql`, `,
          )})`
        : sql``;
    const result = await this.db.execute(sql`
      WITH candidates AS (
        SELECT id
        FROM background_jobs
        WHERE (
          status IN ('PENDING', 'RETRY_SCHEDULED')
          OR (status = 'RUNNING' AND locked_at < now() - interval '10 minutes')
        )
        ${typeFilter}
        AND run_after <= now()
        ORDER BY run_after ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      UPDATE background_jobs AS jobs
      SET status = 'RUNNING',
          attempts = jobs.attempts + 1,
          locked_at = now(),
          locked_by = ${workerId},
          updated_at = now()
      FROM candidates
      WHERE jobs.id = candidates.id
      RETURNING
        jobs.id,
        jobs.job_type AS "jobType",
        jobs.source_key AS "sourceKey",
        jobs.payload,
        jobs.status,
        jobs.attempts,
        jobs.run_after AS "runAfter",
        jobs.locked_at AS "lockedAt",
        jobs.locked_by AS "lockedBy",
        jobs.last_error AS "lastError",
        jobs.created_at AS "createdAt",
        jobs.updated_at AS "updatedAt",
        jobs.completed_at AS "completedAt"
    `);

    return result.rows as unknown as BackgroundJob[];
  }

  async complete(jobId: string, workerId: string): Promise<void> {
    await this.db
      .update(backgroundJobs)
      .set({
        status: "SUCCEEDED",
        lockedAt: null,
        lockedBy: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(backgroundJobs.id, jobId), eq(backgroundJobs.lockedBy, workerId)));
  }

  async fail(jobId: string, workerId: string, error: string, retryAt: Date): Promise<void> {
    const [job] = await this.db
      .select({ attempts: backgroundJobs.attempts })
      .from(backgroundJobs)
      .where(and(eq(backgroundJobs.id, jobId), eq(backgroundJobs.lockedBy, workerId)))
      .limit(1);
    if (!job) return;

    const terminal = job.attempts >= maximumAttempts;
    await this.db
      .update(backgroundJobs)
      .set({
        status: terminal ? "FAILED" : "RETRY_SCHEDULED",
        lastError: safeJobError(error),
        runAfter: retryAt,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(and(eq(backgroundJobs.id, jobId), eq(backgroundJobs.lockedBy, workerId)));
  }
}
