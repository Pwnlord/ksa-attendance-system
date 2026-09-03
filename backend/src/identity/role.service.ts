import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.module";
import { roleAssignments, users } from "../database/schema";
import { AuditService } from "./audit.service";
import { AppError } from "../common/errors/app-error";
import { PasswordHasherService } from "../security/password/password-hasher.service";

export type RoleName = "PARTICIPANT" | "COURSE_REP" | "ADMIN";

@Injectable()
export class RoleService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly passwords: PasswordHasherService,
  ) {}

  async list(userId: string): Promise<RoleName[]> {
    const assignments = await this.db
      .select({ role: roleAssignments.role })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, userId), isNull(roleAssignments.revokedAt)));
    return assignments.map((assignment) => assignment.role as RoleName);
  }

  async hasAny(userId: string, required: string[]): Promise<boolean> {
    const assignments = await this.db
      .select({ role: roleAssignments.role })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, userId), isNull(roleAssignments.revokedAt)));
    return assignments.some((assignment) => required.includes(assignment.role));
  }

  async replaceCourseRep(
    actorId: string,
    participantId: string,
    reason: string,
    currentPassword: string,
  ): Promise<void> {
    await this.assertRecentAuthentication(actorId, currentPassword);
    await this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, participantId), eq(users.accountStatus, "ACTIVE")))
        .limit(1);
      if (!participant)
        throw new AppError("NOT_FOUND", 404, "The selected participant was not found.");

      const participantRole = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, participantId),
            eq(roleAssignments.role, "PARTICIPANT"),
            isNull(roleAssignments.revokedAt),
          ),
        )
        .limit(1);
      if (!participantRole[0]) {
        throw new AppError(
          "CONFLICT",
          409,
          "Only a registered participant can be Course Representative.",
        );
      }

      const current = await tx
        .select({ id: roleAssignments.id, userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(and(eq(roleAssignments.role, "COURSE_REP"), isNull(roleAssignments.revokedAt)))
        .limit(1);
      if (current[0]?.userId === participantId) return;

      const now = new Date();
      if (current[0]) {
        await tx
          .update(roleAssignments)
          .set({ revokedAt: now, revokedByUserId: actorId, reason })
          .where(eq(roleAssignments.id, current[0].id));
      }
      await tx.insert(roleAssignments).values({
        userId: participantId,
        role: "COURSE_REP",
        assignedByUserId: actorId,
        reason,
      });
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: "ADMIN",
        action: "COURSE_REP_REPLACED",
        targetType: "USER",
        targetId: participantId,
        reason,
        beforeValue: { previousCourseRepUserId: current[0]?.userId ?? null },
        afterValue: { courseRepUserId: participantId },
      });
    });
  }

  async grantAdmin(
    actorId: string,
    targetId: string,
    reason: string,
    currentPassword: string,
  ): Promise<void> {
    await this.assertRecentAuthentication(actorId, currentPassword);
    await this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, targetId), eq(users.accountStatus, "ACTIVE")))
        .limit(1);
      if (!target) throw new AppError("NOT_FOUND", 404, "The selected account was not found.");

      const [active] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, targetId),
            eq(roleAssignments.role, "ADMIN"),
            isNull(roleAssignments.revokedAt),
          ),
        )
        .limit(1);
      if (active) return;

      await tx.insert(roleAssignments).values({
        userId: targetId,
        role: "ADMIN",
        assignedByUserId: actorId,
        reason,
      });
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: "ADMIN",
        action: "ADMIN_ROLE_GRANTED",
        targetType: "USER",
        targetId,
        reason,
        afterValue: { role: "ADMIN" },
      });
    });
  }

  async revokeAdmin(
    actorId: string,
    targetId: string,
    reason: string,
    currentPassword: string,
  ): Promise<void> {
    await this.assertRecentAuthentication(actorId, currentPassword);
    await this.db.transaction(async (tx) => {
      const [active] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, targetId),
            eq(roleAssignments.role, "ADMIN"),
            isNull(roleAssignments.revokedAt),
          ),
        )
        .limit(1);
      if (!active) throw new AppError("NOT_FOUND", 404, "The Administrator role was not found.");

      const administrators = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(and(eq(roleAssignments.role, "ADMIN"), isNull(roleAssignments.revokedAt)));
      if (administrators.length <= 1) {
        throw new AppError("CONFLICT", 409, "The final Administrator cannot be removed.");
      }

      await tx
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedByUserId: actorId, reason })
        .where(eq(roleAssignments.id, active.id));
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: "ADMIN",
        action: "ADMIN_ROLE_REVOKED",
        targetType: "USER",
        targetId,
        reason,
        beforeValue: { role: "ADMIN" },
        afterValue: { role: null },
      });
    });
  }

  private async assertRecentAuthentication(
    actorId: string,
    currentPassword: string,
  ): Promise<void> {
    const [actor] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);
    if (!actor || !(await this.passwords.verify(actor.passwordHash, currentPassword))) {
      throw new AppError(
        "AUTHENTICATION_REQUIRED",
        401,
        "Confirm your current password to continue.",
      );
    }
  }
}
