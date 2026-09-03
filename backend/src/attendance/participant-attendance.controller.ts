import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { AuthRequestContext } from "../identity/decorators/current-user.decorator";
import { Roles } from "../identity/decorators/roles.decorator";
import { AttendanceService } from "./attendance.service";

@Controller("me/attendance")
@Roles("PARTICIPANT")
export class ParticipantAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  history(@CurrentUser() auth: AuthRequestContext, @Query("limit") limit?: number) {
    return this.attendance.history(auth.userId, limit);
  }
}
