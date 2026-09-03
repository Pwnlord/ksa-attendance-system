import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { JOB_QUEUE } from "./job-queue.port";
import { PostgresJobQueue } from "./postgres-job-queue.adapter";

@Module({
  imports: [DatabaseModule],
  providers: [PostgresJobQueue, { provide: JOB_QUEUE, useExisting: PostgresJobQueue }],
  exports: [JOB_QUEUE],
})
export class JobsModule {}
