import { HttpException, HttpStatus } from "@nestjs/common";

export type SafeErrorDetails = Record<string, unknown>;

export class AppError extends HttpException {
  readonly code: string;
  readonly details: SafeErrorDetails;

  constructor(code: string, status: HttpStatus, message: string, details: SafeErrorDetails = {}) {
    super({ error: { code, message, details } }, status);
    this.code = code;
    this.details = details;
    this.message = message;
  }
}
