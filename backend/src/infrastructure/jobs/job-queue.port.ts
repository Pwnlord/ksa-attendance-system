import type { BackgroundJob } from "../../database/schema";
import type { DatabaseClient } from "../../database/database.module";

export const JOB_QUEUE = Symbol("JOB_QUEUE");

export interface EnqueueJobInput {
  jobType: string;
  sourceKey: string;
  payload: Record<string, unknown>;
  runAfter?: Date;
}

export interface JobQueue {
  enqueue(input: EnqueueJobInput): Promise<Pick<BackgroundJob, "id" | "status">>;
  enqueueWith(
    db: DatabaseClient,
    input: EnqueueJobInput,
  ): Promise<Pick<BackgroundJob, "id" | "status">>;
  claimBatch(
    workerId: string,
    limit: number,
    jobTypes?: readonly string[],
  ): Promise<BackgroundJob[]>;
  complete(jobId: string, workerId: string): Promise<void>;
  fail(jobId: string, workerId: string, error: string, retryAt: Date): Promise<void>;
}
