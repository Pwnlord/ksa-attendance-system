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
import type { Request, Response } from "express";
import { AppError } from "../common/errors/app-error";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { AuthRequestContext } from "../identity/decorators/current-user.decorator";
import { Roles } from "../identity/decorators/roles.decorator";
import { ManualVerificationService } from "./manual-verification.service";
import {
  AttendanceCorrectionDto,
  EmergencyAttendanceDto,
  ManualVerificationRequestDto,
  ReviewDecisionRequestDto,
} from "./dto/review.dto";

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

function reviewStatus(value: string | undefined): ReviewStatus | undefined {
  if (value === undefined) return undefined;
  if (!["PENDING", "APPROVED", "REJECTED", "EXPIRED"].includes(value)) {
    throw new AppError("VALIDATION_ERROR", 400, "Enter a valid manual-review status.");
  }
  return value as ReviewStatus;
}

@Controller()
export class ManualVerificationController {
  constructor(private readonly manual: ManualVerificationService) {}

  @Get("me/manual-verifications")
  @Roles("PARTICIPANT")
  ownCases(@CurrentUser() auth: AuthRequestContext, @Query("status") status?: string) {
    return this.manual.listOwn(auth.userId, reviewStatus(status));
  }

  @Post("manual-verification-requests")
  @Roles("PARTICIPANT")
  async requestCase(
    @CurrentUser() auth: AuthRequestContext,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ManualVerificationRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.manual.createExplicitRequest(
      auth.userId,
      input,
      idempotencyKey ?? "",
      request.correlationId,
    );
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return { data: result.data };
  }

  @Get("manual-verifications")
  @Roles("COURSE_REP", "ADMIN")
  listCases(
    @CurrentUser() auth: AuthRequestContext,
    @Query("status") status?: string,
    @Query("limit") limit?: number,
  ) {
    return this.manual.listOperator(auth.userId, auth.roles, reviewStatus(status), limit);
  }

  @Get("manual-verifications/:caseId")
  @Roles("COURSE_REP", "ADMIN")
  detail(@CurrentUser() auth: AuthRequestContext, @Param("caseId") caseId: string) {
    return this.manual.detail(caseId, auth.userId, auth.roles);
  }

  @Post("manual-verifications/emergency-attendance")
  @Roles("COURSE_REP", "ADMIN")
  async emergency(
    @CurrentUser() auth: AuthRequestContext,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: EmergencyAttendanceDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.manual.createEmergency(
      auth.userId,
      auth.roles,
      idempotencyKey ?? "",
      input,
      request.correlationId,
    );
    response.status(HttpStatus.CREATED);
    return result;
  }

  @Post("manual-verifications/:caseId/approve")
  @Roles("COURSE_REP", "ADMIN")
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() auth: AuthRequestContext,
    @Param("caseId") caseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ReviewDecisionRequestDto,
    @Req() request: Request,
  ) {
    return this.manual.decide(
      caseId,
      auth.userId,
      auth.roles,
      input.expectedVersion,
      input.reason,
      true,
      request.correlationId,
      idempotencyKey ?? "",
    );
  }

  @Post("manual-verifications/:caseId/reject")
  @Roles("COURSE_REP", "ADMIN")
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() auth: AuthRequestContext,
    @Param("caseId") caseId: string,
    @Body() input: ReviewDecisionRequestDto,
    @Req() request: Request,
  ) {
    return this.manual.decide(
      caseId,
      auth.userId,
      auth.roles,
      input.expectedVersion,
      input.reason,
      false,
      request.correlationId,
    );
  }

  @Post("admin/attendance/corrections")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  correction(
    @CurrentUser() auth: AuthRequestContext,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: AttendanceCorrectionDto,
    @Req() request: Request,
  ) {
    return this.manual
      .correctAttendance(auth.userId, input, idempotencyKey ?? "", request.correlationId)
      .then((data) => ({ data }));
  }
}
