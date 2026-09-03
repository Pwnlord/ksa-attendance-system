import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.module";
import { roleAssignments, users } from "../database/schema";
import { AppError } from "../common/errors/app-error";
import { PasswordHasherService } from "../security/password/password-hasher.service";
import { AccountTokenService } from "./account-token.service";
import { AuditService } from "./audit.service";
import { RoleName, RoleService } from "./role.service";
import { normalizeEmail, normalizeName, normalizePhone, isValidPhone } from "./normalization";
import { ProfileUpdateDto } from "./dto/auth.dto";

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly roles: RoleService,
    private readonly passwords: PasswordHasherService,
    private readonly accountTokens: AccountTokenService,
    private readonly audit: AuditService,
  ) {}

  async findById(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user;
  }

  async findByIdentifier(identifier: string) {
    const normalized = identifier.includes("@")
      ? normalizeEmail(identifier)
      : identifier.trim().toUpperCase();
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        normalized.includes("@")
          ? eq(users.normalizedEmail, normalized)
          : eq(users.participantSerial, normalized),
      )
      .limit(1);
    return user;
  }

  async authenticate(identifier: string, password: string) {
    const user = await this.findByIdentifier(identifier);
    if (!user || user.accountStatus !== "ACTIVE") return null;
    const valid = await this.passwords.verify(user.passwordHash, password);
    return valid ? user : null;
  }

  async hashPassword(password: string): Promise<string> {
    return this.passwords.hash(password);
  }

  async activeAdministrators() {
    return this.db
      .select({ user: users })
      .from(roleAssignments)
      .innerJoin(users, eq(roleAssignments.userId, users.id))
      .where(and(eq(roleAssignments.role, "ADMIN"), isNull(roleAssignments.revokedAt)))
      .then((rows) => rows.map((row) => row.user));
  }

  async toUser(user: NonNullable<Awaited<ReturnType<IdentityService["findById"]>>>) {
    const roles = await this.roles.list(user.id);
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.normalizedPhone,
      email: user.normalizedEmail ?? "",
      serialNumber: user.participantSerial,
      roles,
      status: user.accountStatus === "ACTIVE" ? "ACTIVE" : "DISABLED",
      emailVerifiedAt: user.emailVerifiedAt,
      registeredAt: user.createdAt,
    };
  }

  async authenticatedEnvelope(userId: string, attendanceDeviceStatus: string | null = null) {
    const user = await this.findById(userId);
    if (!user) throw new AppError("AUTHENTICATION_REQUIRED", 401, "Please sign in to continue.");
    return { data: { user: await this.toUser(user), attendanceDeviceStatus } };
  }

  async participantSummary(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new AppError("NOT_FOUND", 404, "The requested account was not found.");
    const roles = await this.roles.list(user.id);
    return {
      id: user.id,
      fullName: user.fullName,
      serialNumber: user.participantSerial ?? "KSA-00",
      status: user.accountStatus === "ACTIVE" ? "ACTIVE" : "DISABLED",
      roles,
    };
  }

  async searchParticipants(query: string, limit = 50) {
    const normalized = query.trim();
    if (normalized.length < 2 || normalized.length > 100) {
      throw new AppError("VALIDATION_ERROR", 400, "Enter at least two characters to search.");
    }
    const search = `%${normalized.replace(/[%_]/g, "\\$&")}%`;
    const participants = await this.db
      .select({ user: users })
      .from(users)
      .innerJoin(roleAssignments, eq(roleAssignments.userId, users.id))
      .where(
        and(
          eq(users.accountStatus, "ACTIVE"),
          eq(roleAssignments.role, "PARTICIPANT"),
          isNull(roleAssignments.revokedAt),
          or(
            ilike(users.fullName, search),
            ilike(users.participantSerial, search),
            ilike(users.normalizedEmail, search),
            ilike(users.normalizedPhone, search),
          ),
        ),
      )
      .orderBy(users.fullName)
      .limit(Math.min(Math.max(limit, 1), 100));
    return {
      items: await Promise.all(participants.map(({ user }) => this.participantSummary(user.id))),
      nextCursor: null,
    };
  }

  async updateOwnProfile(
    userId: string,
    input: ProfileUpdateDto,
  ): Promise<Awaited<ReturnType<IdentityService["toUser"]>>> {
    if (!input.fullName && !input.phone && !input.email) {
      throw new AppError("VALIDATION_ERROR", 400, "Provide at least one profile field to update.");
    }
    const current = await this.findById(userId);
    if (!current) throw new AppError("AUTHENTICATION_REQUIRED", 401, "Please sign in to continue.");
    const securityChange = Boolean(input.phone || input.email);
    if (
      securityChange &&
      (!input.currentPassword ||
        !(await this.passwords.verify(current.passwordHash, input.currentPassword)))
    ) {
      throw new AppError(
        "AUTHENTICATION_REQUIRED",
        401,
        "Your current password is required for this change.",
      );
    }

    const fullName = input.fullName ? normalizeName(input.fullName) : undefined;
    const phone = input.phone === undefined ? undefined : normalizePhone(input.phone);
    const email = input.email === undefined ? undefined : normalizeEmail(input.email);
    if (phone !== undefined && !isValidPhone(phone)) {
      throw new AppError("VALIDATION_ERROR", 400, "Enter a valid phone number.", {
        field: "phone",
      });
    }

    try {
      await this.db
        .update(users)
        .set({
          ...(fullName ? { fullName } : {}),
          ...(phone !== undefined ? { normalizedPhone: phone } : {}),
          ...(email !== undefined ? { normalizedEmail: email, emailVerifiedAt: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("CONFLICT", 409, "That email or phone number is already in use.");
      }
      throw error;
    }

    if (email !== undefined && email !== current.normalizedEmail) {
      await this.accountTokens.issueVerification(userId, email, fullName ?? current.fullName);
    }
    const updated = await this.findById(userId);
    if (!updated) throw new Error("Updated account was not found.");
    const actorRoles = await this.roles.list(userId);
    await this.audit.record({
      actorUserId: userId,
      actorRole: actorRoles.includes("ADMIN")
        ? "ADMIN"
        : actorRoles.includes("COURSE_REP")
          ? "COURSE_REP"
          : "PARTICIPANT",
      action: "PROFILE_UPDATED",
      targetType: "USER",
      targetId: userId,
      afterValue: {
        changedFields: [
          ...(fullName ? ["fullName"] : []),
          ...(phone !== undefined ? ["phone"] : []),
          ...(email !== undefined ? ["email"] : []),
        ],
      },
    });
    return this.toUser(updated);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505",
  );
}

export type SafeUser = Awaited<ReturnType<IdentityService["toUser"]>>;
export type SafeRole = RoleName;
