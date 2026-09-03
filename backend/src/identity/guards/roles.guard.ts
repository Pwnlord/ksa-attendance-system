import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppError } from "../../common/errors/app-error";
import { REQUIRED_ROLES_KEY } from "../decorators/roles.decorator";
import { RoleService } from "../role.service";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roles: RoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.auth?.userId;
    if (!userId || !(await this.roles.hasAny(userId, required))) {
      throw new AppError(
        "AUTHORIZATION_DENIED",
        403,
        "You are not allowed to perform this action.",
      );
    }
    if (request.auth) request.auth.roles = await this.roles.list(userId);
    return true;
  }
}
