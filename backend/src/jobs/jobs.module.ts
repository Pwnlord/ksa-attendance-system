import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AttendanceModule } from "../attendance/attendance.module";
import { IdentityModule } from "../identity/identity.module";
import { EmailModule } from "../infrastructure/email/email.module";
import { JobsModule as QueueModule } from "../infrastructure/jobs/jobs.module";
import { SheetsModule } from "../sheets/sheets.module";
import { JobsController } from "./jobs.controller";
import { JobRunnerService } from "./job-runner.service";

@Module({
  imports: [ConfigModule, QueueModule, IdentityModule, AttendanceModule, EmailModule, SheetsModule],
  controllers: [JobsController],
  providers: [JobRunnerService],
  exports: [JobRunnerService],
})
export class JobRunnerModule {}
