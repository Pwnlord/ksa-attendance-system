import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ManualVerificationService } from "../attendance/manual-verification.service";
import {
  ATTENDANCE_SHEETS_SYNC_JOB,
  MANUAL_CASE_EXPIRE_JOB,
  SESSION_AUTO_CLOSE_JOB,
  SESSION_AUTO_OPEN_JOB,
} from "../attendance/job-types";
import { SessionService } from "../attendance/session.service";
import { PHOTO_RETENTION_JOB } from "../identity/identity.constants";
import { PhotoRetentionService } from "../identity/photo-retention.service";
import { EMAIL_VERIFICATION_JOB, PASSWORD_RESET_JOB } from "../identity/identity.constants";
import { TransactionalEmailService } from "../infrastructure/email/transactional-email.service";
import { JOB_QUEUE, JobQueue } from "../infrastructure/jobs/job-queue.port";
import { captureSanitizedError } from "../observability/sentry";
import { SheetsService } from "../sheets/sheets.service";
import { SHEETS_RECONCILE_JOB } from "../sheets/sheets-job-types";
import { sheetsRetryDelaySeconds } from "../sheets/sheets-retry";

const supportedJobTypes = [
  SESSION_AUTO_OPEN_JOB,
  SESSION_AUTO_CLOSE_JOB,
  MANUAL_CASE_EXPIRE_JOB,
  ATTENDANCE_SHEETS_SYNC_JOB,
  SHEETS_RECONCILE_JOB,
  EMAIL_VERIFICATION_JOB,
  PASSWORD_RESET_JOB,
  PHOTO_RETENTION_JOB,
] as const;

function sessionIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("sessionId" in payload)) return undefined;
  const sessionId = (payload as { sessionId?: unknown }).sessionId;
  return typeof sessionId === "string" ? sessionId : undefined;
}

function caseIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("caseId" in payload)) return undefined;
  const caseId = (payload as { caseId?: unknown }).caseId;
  return typeof caseId === "string" ? caseId : undefined;
}

function photoIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("photoId" in payload)) return undefined;
  const photoId = (payload as { photoId?: unknown }).photoId;
  return typeof photoId === "string" ? photoId : undefined;
}

export interface JobRunResult {
  claimed: number;
  succeeded: number;
  failed: number;
}

@Injectable()
export class JobRunnerService {
  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly sessions: SessionService,
    private readonly manual: ManualVerificationService,
    private readonly sheets: SheetsService,
    private readonly email: TransactionalEmailService,
    private readonly photoRetention: PhotoRetentionService,
  ) {}

  async runOnce(limit = 25): Promise<JobRunResult> {
    const workerId = `scheduled-runner:${process.pid}:${randomUUID()}`;
    const jobs = await this.queue.claimBatch(
      workerId,
      Math.max(1, Math.min(Math.floor(limit), 100)),
      supportedJobTypes,
    );
    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        await this.process(job.jobType, job.payload);
        await this.queue.complete(job.id, workerId);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Background job failed.";
        captureSanitizedError("Background job failed", { jobType: job.jobType });
        const retrySeconds =
          job.jobType === ATTENDANCE_SHEETS_SYNC_JOB || job.jobType === SHEETS_RECONCILE_JOB
            ? sheetsRetryDelaySeconds(job.attempts)
            : Math.min(60 * 60, 2 ** Math.min(job.attempts, 8));
        await this.queue.fail(
          job.id,
          workerId,
          message,
          new Date(Date.now() + retrySeconds * 1000),
        );
      }
    }

    return { claimed: jobs.length, succeeded, failed };
  }

  private async process(jobType: string, payload: unknown): Promise<void> {
    if (jobType === MANUAL_CASE_EXPIRE_JOB) {
      const caseId = caseIdFromPayload(payload);
      if (!caseId) throw new Error("Manual-case expiry payload is missing a case ID.");
      await this.manual.expireDueCase(caseId);
      return;
    }
    if (jobType === EMAIL_VERIFICATION_JOB || jobType === PASSWORD_RESET_JOB) {
      await this.email.processJob(jobType, payload);
      return;
    }
    if (jobType === PHOTO_RETENTION_JOB) {
      const photoId = photoIdFromPayload(payload);
      if (!photoId) throw new Error("Photo-retention payload is missing a photo ID.");
      await this.photoRetention.processJob({ photoId });
      return;
    }
    if (jobType === ATTENDANCE_SHEETS_SYNC_JOB || jobType === SHEETS_RECONCILE_JOB) {
      await this.sheets.processJob(jobType, payload);
      return;
    }
    const sessionId = sessionIdFromPayload(payload);
    if (!sessionId) throw new Error("Lifecycle job payload is missing a session ID.");
    await this.sessions.processLifecycleJob(jobType, sessionId);
  }
}
