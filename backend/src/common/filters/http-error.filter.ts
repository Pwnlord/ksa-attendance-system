import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError, SafeErrorDetails } from "../errors/app-error";
import { SanitizedLoggerService } from "../logging/sanitized-logger.service";
import { captureSanitizedError } from "../../observability/sentry";

interface ErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  message?: unknown;
}

const statusCodes: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "VALIDATION_ERROR",
  [HttpStatus.UNAUTHORIZED]: "AUTHENTICATION_REQUIRED",
  [HttpStatus.FORBIDDEN]: "AUTHORIZATION_DENIED",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "REQUEST_NOT_PROCESSABLE",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
  [HttpStatus.SERVICE_UNAVAILABLE]: "SERVICE_TEMPORARILY_UNAVAILABLE",
};

function messageFrom(value: unknown): string {
  if (Array.isArray(value)) return "The request contains invalid values.";
  return typeof value === "string" && value.length <= 240
    ? value
    : "The request could not be completed.";
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: SanitizedLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const correlationId = request.correlationId ?? "req_unknown";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "Something went wrong. Please try again.";
    let details: SafeErrorDetails = {};

    if (exception instanceof AppError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as ErrorBody;
      const nested = body && typeof body === "object" ? body.error : undefined;
      code = typeof nested?.code === "string" ? nested.code : (statusCodes[status] ?? "HTTP_ERROR");
      message = messageFrom(nested?.message ?? body?.message);
      details =
        nested?.details && typeof nested.details === "object"
          ? (nested.details as SafeErrorDetails)
          : {};
    }

    if (status >= 500) {
      this.logger.error("http_error", {
        correlationId,
        method: request.method,
        path: request.path,
        status,
        code,
      });
      captureSanitizedError("Unhandled HTTP error", {
        method: request.method,
        status,
        code,
      });
    }

    response.status(status).json({
      error: {
        code,
        message,
        correlationId,
        details,
      },
    });
  }
}
