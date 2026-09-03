import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { REQUIRED_ROLES_KEY } from "../decorators/roles.decorator";
import { RateLimitService } from "../rate-limit.service";
import { CourseConfigService } from "../course-config.service";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class AdminRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: RateLimitService,
    private readonly courseConfig: CourseConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();
    if (!required?.includes("ADMIN") || safeMethods.has(request.method) || !request.auth)
      return true;
    const config = await this.courseConfig.getRecord();
    await this.limits.assertAllowed(
      `admin-action:${request.auth.userId}`,
      config.privilegedAdminLimitPerMinute,
      60 * 1000,
      context.switchToHttp().getResponse<Response>(),
    );
    return true;
  }
}
