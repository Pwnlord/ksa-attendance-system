import { Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "../common/errors/app-error";
import { Public } from "../common/decorators/public.decorator";
import { AuditService } from "../identity/audit.service";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { AuthRequestContext } from "../identity/decorators/current-user.decorator";
import { Roles } from "../identity/decorators/roles.decorator";
import { JobRunnerService } from "./job-runner.service";

function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const received = Buffer.from(provided, "utf8");
  const configured = Buffer.from(expected, "utf8");
  return received.length === configured.length && timingSafeEqual(received, configured);
}

@Controller()
export class JobsController {
  constructor(
    private readonly runner: JobRunnerService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  @Post("internal/jobs/run")
  @Public()
  @HttpCode(HttpStatus.OK)
  async runInternal(@Headers("x-job-runner-secret") secret: string | undefined) {
    if (this.config.get<string>("app.jobRunnerMode") !== "endpoint") {
      throw new AppError("NOT_FOUND", 404, "The requested operation was not found.");
    }
    const configured = this.config.get<string>("app.jobRunnerSecret");
    if (!configured || !secretsMatch(secret, configured)) {
      throw new AppError(
        "AUTHENTICATION_REQUIRED",
        401,
        "The requested operation is not authorized.",
      );
    }
    return { data: await this.runner.runOnce() };
  }

  @Post("admin/jobs/run")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  async runAsAdministrator(@CurrentUser() auth: AuthRequestContext) {
    const result = await this.runner.runOnce();
    await this.audit.record({
      actorUserId: auth.userId,
      actorRole: "ADMIN",
      action: "BACKGROUND_JOBS_RUN",
      targetType: "BACKGROUND_JOB",
      reason: "Administrator manually processed due background jobs.",
      afterValue: { ...result },
    });
    return { data: result };
  }
}
