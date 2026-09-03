import { Injectable, Logger } from "@nestjs/common";

const sensitiveKeyPattern =
  /(password|token|cookie|authorization|secret|credential|photo|coordinate|latitude|longitude|signed.?url|request.?body)/i;

function sanitize(value: unknown, key = "", depth = 0): unknown {
  if (sensitiveKeyPattern.test(key)) return "[REDACTED]";
  if (depth > 4) return "[TRUNCATED]";
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, key, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey, depth + 1)]),
    );
  }
  return value;
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitize(metadata);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

@Injectable()
export class SanitizedLoggerService {
  private readonly logger = new Logger("KSA");

  info(event: string, metadata: Record<string, unknown> = {}): void {
    this.logger.log(JSON.stringify({ event, ...sanitizeMetadata(metadata) }));
  }

  warn(event: string, metadata: Record<string, unknown> = {}): void {
    this.logger.warn(JSON.stringify({ event, ...sanitizeMetadata(metadata) }));
  }

  error(event: string, metadata: Record<string, unknown> = {}): void {
    this.logger.error(JSON.stringify({ event, ...sanitizeMetadata(metadata) }));
  }
}
