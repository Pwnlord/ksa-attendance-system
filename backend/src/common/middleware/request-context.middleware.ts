import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header("x-request-id");
    const correlationId =
      incoming && requestIdPattern.test(incoming) ? incoming : `req_${randomUUID()}`;

    request.correlationId = correlationId;
    response.setHeader("x-request-id", correlationId);
    next();
  }
}
