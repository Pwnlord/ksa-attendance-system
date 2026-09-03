import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { DATABASE } from "../database/database.constants";
import type { Database, DatabaseClient } from "../database/database.module";
import { emailVerificationTokens, passwordResetTokens, users } from "../database/schema";
import { JOB_QUEUE, JobQueue } from "../infrastructure/jobs/job-queue.port";
import {
  EMAIL_VERIFICATION_JOB,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_JOB,
  PASSWORD_RESET_TTL_MS,
} from "./identity.constants";
import { TokenProtectorService } from "./token-protector.service";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class AccountTokenService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    private readonly protector: TokenProtectorService,
  ) {}

  async issueVerification(
    userId: string,
    email: string,
    fullName: string,
    db: DatabaseClient = this.db,
  ): Promise<void> {
    const rawToken = newToken();
    const [token] = await db
      .insert(emailVerificationTokens)
      .values({
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      })
      .returning({ id: emailVerificationTokens.id });
    if (!token) throw new Error("Email verification token was not created.");

    await this.jobs.enqueueWith(db, {
      jobType: EMAIL_VERIFICATION_JOB,
      sourceKey: `email-verification:${token.id}`,
      payload: {
        protectedDelivery: this.protector.encrypt(
          JSON.stringify({ token: rawToken, email, fullName }),
        ),
      },
    });
  }

  async issuePasswordReset(
    userId: string,
    email: string,
    fullName: string,
    db: DatabaseClient = this.db,
  ): Promise<void> {
    const rawToken = newToken();
    const [token] = await db
      .insert(passwordResetTokens)
      .values({
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      })
      .returning({ id: passwordResetTokens.id });
    if (!token) throw new Error("Password reset token was not created.");

    await this.jobs.enqueueWith(db, {
      jobType: PASSWORD_RESET_JOB,
      sourceKey: `password-reset:${token.id}`,
      payload: {
        protectedDelivery: this.protector.encrypt(
          JSON.stringify({ token: rawToken, email, fullName }),
        ),
      },
    });
  }

  async confirmEmail(rawToken: string): Promise<boolean> {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const [token] = await tx
        .update(emailVerificationTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, hashToken(rawToken)),
            isNull(emailVerificationTokens.consumedAt),
            gt(emailVerificationTokens.expiresAt, now),
          ),
        )
        .returning({ userId: emailVerificationTokens.userId });
      if (!token) return false;
      await tx
        .update(users)
        .set({ emailVerifiedAt: now, updatedAt: now })
        .where(eq(users.id, token.userId));
      return true;
    });
  }

  async consumePasswordReset(rawToken: string, passwordHash: string): Promise<string | null> {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const [token] = await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hashToken(rawToken)),
            isNull(passwordResetTokens.consumedAt),
            gt(passwordResetTokens.expiresAt, now),
          ),
        )
        .returning({ userId: passwordResetTokens.userId });
      if (!token) return null;
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, token.userId));
      return token.userId;
    });
  }
}
