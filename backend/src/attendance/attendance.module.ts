import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { IdentityModule } from "../identity/identity.module";
import { JobsModule } from "../infrastructure/jobs/jobs.module";
import { SecurityModule } from "../security/security.module";
import { SessionsController } from "./sessions.controller";
import { SessionService } from "./session.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { ManualVerificationController } from "./manual-verification.controller";
import { ManualVerificationService } from "./manual-verification.service";
import { DeviceChangeController } from "./device-change.controller";
import { DeviceChangeService } from "./device-change.service";
import { ParticipantsController } from "./participants.controller";
import { ParticipantAttendanceController } from "./participant-attendance.controller";

@Module({
  imports: [DatabaseModule, IdentityModule, JobsModule, SecurityModule],
  controllers: [
    SessionsController,
    AttendanceController,
    ManualVerificationController,
    DeviceChangeController,
    ParticipantsController,
    ParticipantAttendanceController,
  ],
  providers: [SessionService, AttendanceService, ManualVerificationService, DeviceChangeService],
  exports: [SessionService, AttendanceService, ManualVerificationService, DeviceChangeService],
})
export class AttendanceModule {}
