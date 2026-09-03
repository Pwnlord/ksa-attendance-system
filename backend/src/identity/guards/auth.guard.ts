import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error";
import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator";
import { SessionService } from "../../security/session/session.service";
import { IdentityService } from "../identity.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const cookieName = this.config.getOrThrow<string>("app.sessionCookieName");
    const session = await this.sessions.validateAndRenew(request.cookies?.[cookieName], response);
    if (!session) {
      throw new AppError("AUTHENTICATION_REQUIRED", 401, "Please sign in to continue.");
    }

    const user = await this.identity.findById(session.userId);
    if (!user || user.accountStatus !== "ACTIVE") {
      await this.sessions.revokeAllForUser(session.userId);
      throw new AppError("AUTHENTICATION_REQUIRED", 401, "Please sign in to continue.");
    }
    request.auth = { userId: user.id, sessionId: session.id, roles: [] };
    return true;
  }
}
