import { Inject, Injectable } from "@nestjs/common";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.module";
import { rateLimitBuckets } from "../database/schema";
import { sql } from "drizzle-orm";
import type { Response } from "express";
import { AppError } from "../common/errors/app-error";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimitService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);
    const [bucket] = await this.db
      .insert(rateLimitBuckets)
      .values({ bucketKey: key, windowStartedAt: now, count: 1 })
      .onConflictDoUpdate({
        target: rateLimitBuckets.bucketKey,
        set: {
          windowStartedAt: sql`CASE WHEN ${rateLimitBuckets.windowStartedAt} < ${windowStart} THEN ${now} ELSE ${rateLimitBuckets.windowStartedAt} END`,
          count: sql`CASE WHEN ${rateLimitBuckets.windowStartedAt} < ${windowStart} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
          updatedAt: now,
        },
      })
      .returning({
        count: rateLimitBuckets.count,
        windowStartedAt: rateLimitBuckets.windowStartedAt,
      });

    if (bucket) {
      const elapsed = now.getTime() - bucket.windowStartedAt.getTime();
      if (bucket.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
      };
    }

    return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  async assertAllowed(
    key: string,
    limit: number,
    windowMs: number,
    response?: Response,
  ): Promise<void> {
    const result = await this.consume(key, limit, windowMs);
    if (result.allowed) return;
    response?.setHeader("Retry-After", result.retryAfterSeconds);
    throw new AppError("RATE_LIMITED", 429, "Too many requests. Please try again later.", {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}
