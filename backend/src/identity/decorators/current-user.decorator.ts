import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export interface AuthRequestContext {
  userId: string;
  sessionId: string;
  roles: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthRequestContext => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth) throw new Error("Authenticated request context is missing.");
    return request.auth;
  },
);
