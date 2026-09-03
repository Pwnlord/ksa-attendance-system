import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppError } from "../errors/app-error";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigin(request: Request): string | undefined {
  const origin = request.header("origin");
  if (origin) return origin;

  const referer = request.header("referer");
  if (!referer) return undefined;

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (safeMethods.has(request.method)) return true;

    const trustedOrigins = this.config.get<string[]>("app.trustedOrigins", []);
    const origin = requestOrigin(request);
    const cookieName = this.config.getOrThrow<string>("app.sessionCookieName");
    const hasSessionCookie = Boolean(request.cookies?.[cookieName]);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (origin && trustedOrigins.includes(origin)) return true;
    if (isPublic && !hasSessionCookie && !origin) return true;

    throw new AppError(
      "ORIGIN_NOT_ALLOWED",
      403,
      "This request could not be verified. Please return to the application and try again.",
    );
  }
}
