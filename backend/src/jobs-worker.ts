import "dotenv/config";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { AppModule } from "./app.module";
import { JOB_QUEUE, JobQueue } from "./infrastructure/jobs/job-queue.port";
import { SessionService } from "./attendance/session.service";
import { ManualVerificationService } from "./attendance/manual-verification.service";
import { SheetsService } from "./sheets/sheets.service";
import { SHEETS_RECONCILE_JOB } from "./sheets/sheets-job-types";
import { TransactionalEmailService } from "./infrastructure/email/transactional-email.service";
import { EMAIL_VERIFICATION_JOB, PASSWORD_RESET_JOB } from "./identity/identity.constants";
import { PHOTO_RETENTION_JOB } from "./identity/identity.constants";
import { PhotoRetentionService } from "./identity/photo-retention.service";
import { captureSanitizedError, initializeSentry } from "./observability/sentry";
import { sheetsRetryDelaySeconds } from "./sheets/sheets-retry";
import {
  ATTENDANCE_SHEETS_SYNC_JOB,
  MANUAL_CASE_EXPIRE_JOB,
  SESSION_AUTO_CLOSE_JOB,
  SESSION_AUTO_OPEN_JOB,
} from "./attendance/job-types";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  initializeSentry(app.get(ConfigService));
  const queue = app.get<JobQueue>(JOB_QUEUE);
  const sessions = app.get(SessionService);
  const manual = app.get(ManualVerificationService);
  const sheets = app.get(SheetsService);
  const email = app.get(TransactionalEmailService);
  const photoRetention = app.get(PhotoRetentionService);
  const workerId = `attendance-worker:${process.pid}:${randomUUID()}`;
  let running = true;
  const stop = () => {
    running = false;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    while (running) {
      const jobs = await queue.claimBatch(workerId, 10, [
        SESSION_AUTO_OPEN_JOB,
        SESSION_AUTO_CLOSE_JOB,
        MANUAL_CASE_EXPIRE_JOB,
        ATTENDANCE_SHEETS_SYNC_JOB,
        SHEETS_RECONCILE_JOB,
        EMAIL_VERIFICATION_JOB,
        PASSWORD_RESET_JOB,
        PHOTO_RETENTION_JOB,
      ]);
      if (jobs.length === 0) {
        await delay(1_000);
        continue;
      }
      for (const job of jobs) {
        try {
          if (job.jobType === MANUAL_CASE_EXPIRE_JOB) {
            const caseId = caseIdFromPayload(job.payload);
            if (!caseId) throw new Error("Manual-case expiry payload is missing a case ID.");
            await manual.expireDueCase(caseId);
          } else if (job.jobType === EMAIL_VERIFICATION_JOB || job.jobType === PASSWORD_RESET_JOB) {
            await email.processJob(job.jobType, job.payload);
          } else if (job.jobType === PHOTO_RETENTION_JOB) {
            const photoId = photoIdFromPayload(job.payload);
            if (!photoId) throw new Error("Photo-retention payload is missing a photo ID.");
            await photoRetention.processJob({ photoId });
          } else if (
            job.jobType === ATTENDANCE_SHEETS_SYNC_JOB ||
            job.jobType === SHEETS_RECONCILE_JOB
          ) {
            await sheets.processJob(job.jobType, job.payload);
          } else {
            const sessionId = sessionIdFromPayload(job.payload);
            if (!sessionId) throw new Error("Lifecycle job payload is missing a session ID.");
            await sessions.processLifecycleJob(job.jobType, sessionId);
          }
          await queue.complete(job.id, workerId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Background job failed.";
          captureSanitizedError("Background job failed", { jobType: job.jobType });
          const retrySeconds =
            job.jobType === ATTENDANCE_SHEETS_SYNC_JOB || job.jobType === SHEETS_RECONCILE_JOB
              ? sheetsRetryDelaySeconds(job.attempts)
              : Math.min(60 * 60, 2 ** Math.min(job.attempts, 8));
          await queue.fail(job.id, workerId, message, new Date(Date.now() + retrySeconds * 1000));
        }
      }
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  captureSanitizedError("Background worker failed");
  console.error(error instanceof Error ? error.message : "Background worker failed.");
  process.exitCode = 1;
});
