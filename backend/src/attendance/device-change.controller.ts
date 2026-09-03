import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AppError } from "../common/errors/app-error";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { AuthRequestContext } from "../identity/decorators/current-user.decorator";
import { Roles } from "../identity/decorators/roles.decorator";
import { DeviceChangeService } from "./device-change.service";
import { DeviceChangeRequestDto, ReviewDecisionRequestDto } from "./dto/review.dto";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";

function requestStatus(value: string | undefined): RequestStatus | undefined {
  if (value === undefined) return undefined;
  if (!["PENDING", "APPROVED", "REJECTED", "SUPERSEDED"].includes(value)) {
    throw new AppError("VALIDATION_ERROR", 400, "Enter a valid device-review status.");
  }
  return value as RequestStatus;
}

@Controller()
export class DeviceChangeController {
  constructor(
    private readonly devices: DeviceChangeService,
    private readonly config: ConfigService,
  ) {}

  @Get("me/device")
  @Roles("PARTICIPANT")
  status(@CurrentUser() auth: AuthRequestContext, @Req() request: Request) {
    const cookieName = this.config.getOrThrow<string>("app.attendanceDeviceCookieName");
    return this.devices.status(auth.userId, request.cookies?.[cookieName]);
  }

  @Get("me/device-change-requests")
  @Roles("PARTICIPANT")
  own(@CurrentUser() auth: AuthRequestContext) {
    return this.devices.listOwn(auth.userId);
  }

  @Post("me/device-change-requests")
  @Roles("PARTICIPANT")
  async create(
    @CurrentUser() auth: AuthRequestContext,
    @Req() request: Request,
    @Body() input: DeviceChangeRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieName = this.config.getOrThrow<string>("app.attendanceDeviceCookieName");
    const result = await this.devices.createWithCredential(
      auth.userId,
      request.cookies?.[cookieName],
      { userAgent: request.get("user-agent") },
      response,
      input,
      request.correlationId,
    );
    response.status(HttpStatus.CREATED);
    return { data: result.data };
  }

  @Get("device-change-requests")
  @Roles("COURSE_REP", "ADMIN")
  list(
    @CurrentUser() auth: AuthRequestContext,
    @Query("status") status?: string,
    @Query("limit") limit?: number,
  ) {
    return this.devices.listOperator(auth.roles, requestStatus(status), limit);
  }

  @Get("device-change-requests/:requestId")
  @Roles("COURSE_REP", "ADMIN")
  detail(@CurrentUser() auth: AuthRequestContext, @Param("requestId") requestId: string) {
    return this.devices.detail(requestId, auth.userId, auth.roles);
  }

  @Post("device-change-requests/:requestId/approve")
  @Roles("COURSE_REP", "ADMIN")
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() auth: AuthRequestContext,
    @Param("requestId") requestId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ReviewDecisionRequestDto,
    @Req() request: Request,
  ) {
    return this.devices.decide(
      requestId,
      auth.userId,
      auth.roles,
      input.expectedVersion,
      input.reason,
      true,
      request.correlationId,
      idempotencyKey ?? "",
    );
  }

  @Post("device-change-requests/:requestId/reject")
  @Roles("COURSE_REP", "ADMIN")
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() auth: AuthRequestContext,
    @Param("requestId") requestId: string,
    @Body() input: ReviewDecisionRequestDto,
    @Req() request: Request,
  ) {
    return this.devices.decide(
      requestId,
      auth.userId,
      auth.roles,
      input.expectedVersion,
      input.reason,
      false,
      request.correlationId,
    );
  }
}
