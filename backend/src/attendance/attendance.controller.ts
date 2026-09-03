import { Controller, Get, Headers, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { AuthRequestContext } from "../identity/decorators/current-user.decorator";
import { AttendanceService } from "./attendance.service";
import { CheckInDto } from "./dto/check-in.dto";
import { Body } from "@nestjs/common";

@Controller("attendance")
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly config: ConfigService,
  ) {}

  @Get("context")
  context(@CurrentUser() auth: AuthRequestContext, @Req() request: Request) {
    const cookieName = this.config.getOrThrow<string>("app.attendanceDeviceCookieName");
    return this.attendance.context(auth.userId, request.cookies?.[cookieName]);
  }

  @Post("check-in")
  async checkIn(
    @CurrentUser() auth: AuthRequestContext,
    @Req() request: Request,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CheckInDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieName = this.config.getOrThrow<string>("app.attendanceDeviceCookieName");
    const result = await this.attendance.checkIn(
      auth.userId,
      request.cookies?.[cookieName],
      idempotencyKey ?? "",
      input,
      request.correlationId,
    );
    response.status(result.httpStatus);
    return { data: result.data };
  }
}
