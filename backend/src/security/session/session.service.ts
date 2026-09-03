import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";
import { DATABASE } from "../../database/database.constants";
import type { Database } from "../../database/database.module";
import { authSessions } from "../../database/schema";

export interface SessionContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface ActiveSession {
  id: string;
  userId: string;
  absoluteExpiresAt: Date;
}

function hashValue(value: string | undefined): string | null {
  return value ? createHash("sha256").update(value).digest("hex") : null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  async create(
    userId: string,
    context: SessionContext,
    response: Response,
  ): Promise<ActiveSession> {
    const now = new Date();
    const absoluteExpiresAt = addDays(now, this.config.get<number>("app.sessionAbsoluteDays", 90));
    const idleExpiresAt = new Date(
      Math.min(
        addDays(now, this.config.get<number>("app.sessionIdleDays", 30)).getTime(),
        absoluteExpiresAt.getTime(),
      ),
    );
    const token = randomToken();
    const [session] = await this.db
      .insert(authSessions)
      .values({
        userId,
        tokenHash: tokenHash(token),
        lastSeenAt: now,
        idleExpiresAt,
        absoluteExpiresAt,
        userAgentHash: hashValue(context.userAgent),
        ipHash: hashValue(context.ipAddress),
      })
      .returning({
        id: authSessions.id,
        userId: authSessions.userId,
        absoluteExpiresAt: authSessions.absoluteExpiresAt,
      });

    if (!session) throw new Error("Authentication session was not created.");
    this.setCookie(response, token, idleExpiresAt.getTime() - now.getTime());
    return session;
  }

  async validateAndRenew(
    token: string | undefined,
    response?: Response,
  ): Promise<ActiveSession | null> {
    if (!token) return null;

    const [session] = await this.db
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.tokenHash, tokenHash(token)), isNull(authSessions.revokedAt)))
      .limit(1);
    if (!session) return null;

    const now = new Date();
    if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
      await this.revokeById(session.id);
      if (response) this.clearCookie(response);
      return null;
    }

    const idleExpiresAt = new Date(
      Math.min(
        addDays(now, this.config.get<number>("app.sessionIdleDays", 30)).getTime(),
        session.absoluteExpiresAt.getTime(),
      ),
    );
    await this.db
      .update(authSessions)
      .set({ lastSeenAt: now, idleExpiresAt })
      .where(eq(authSessions.id, session.id));

    if (response) this.setCookie(response, token, idleExpiresAt.getTime() - now.getTime());
    return { id: session.id, userId: session.userId, absoluteExpiresAt: session.absoluteExpiresAt };
  }

  async revoke(token: string | undefined, response?: Response): Promise<void> {
    if (token)
      await this.db
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(eq(authSessions.tokenHash, tokenHash(token)));
    if (response) this.clearCookie(response);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
  }

  private cookieOptions(maxAge: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>("app.cookieSecure", false),
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(0, Math.floor(maxAge)),
    };
  }

  private setCookie(response: Response, token: string, maxAge: number): void {
    response.cookie(
      this.config.getOrThrow<string>("app.sessionCookieName"),
      token,
      this.cookieOptions(maxAge),
    );
  }

  private clearCookie(response: Response): void {
    response.clearCookie(
      this.config.getOrThrow<string>("app.sessionCookieName"),
      this.cookieOptions(0),
    );
  }

  private async revokeById(id: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(eq(authSessions.id, id));
  }
}
