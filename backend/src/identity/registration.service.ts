import { Inject, Injectable } from "@nestjs/common";
import { and, eq, or, sql } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.module";
import {
  courseConfig,
  roleAssignments,
  rosterEntries,
  users,
  identificationPhotos,
} from "../database/schema";
import { AppError } from "../common/errors/app-error";
import {
  DeviceCredentialService,
  CreatedDevice,
} from "../security/attendance-device/device-credential.service";
import { PasswordHasherService } from "../security/password/password-hasher.service";
import { AccountTokenService } from "./account-token.service";
import { AuditService } from "./audit.service";
import {
  namesMatch,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeSerial,
  isValidPhone,
} from "./normalization";
import { PhotoService, UploadFile } from "./photo.service";

export interface RegistrationInput {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  serialNumber: string;
  identificationPhoto: UploadFile | undefined;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

export interface RegistrationResult {
  userId: string;
  device: CreatedDevice;
}

@Injectable()
export class RegistrationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly passwords: PasswordHasherService,
    private readonly devices: DeviceCredentialService,
    private readonly accountTokens: AccountTokenService,
    private readonly audit: AuditService,
    private readonly photos: PhotoService,
  ) {}

  async register(input: RegistrationInput): Promise<RegistrationResult> {
    const fullName = normalizeName(input.fullName);
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const serial = normalizeSerial(input.serialNumber);
    if (!isValidPhone(phone)) {
      throw new AppError("VALIDATION_ERROR", 400, "Enter a valid phone number.", {
        field: "phone",
      });
    }
    if (fullName.length < 2) {
      throw new AppError("VALIDATION_ERROR", 400, "Enter your full name.", { field: "fullName" });
    }

    const config = await this.defaultCourseConfig();
    if (config.registrationMode === "PREAPPROVED_ROSTER") {
      if (!serial) {
        throw new AppError(
          "REGISTRATION_NOT_ELIGIBLE",
          409,
          "We could not match these details to an approved roster entry.",
        );
      }
      const candidate = await this.db
        .select()
        .from(rosterEntries)
        .where(and(eq(rosterEntries.courseConfigId, config.id), eq(rosterEntries.serial, serial)))
        .limit(1);
      this.assertRosterMatch(candidate[0], fullName, email, phone);
    }
    await this.assertIdentityAvailable(email, phone, serial);

    const processed = await this.photos.process(input.identificationPhoto);
    await this.photos.store(processed);
    try {
      return await this.db.transaction(async (tx) => {
        let roster: typeof rosterEntries.$inferSelect | undefined;
        if (config.registrationMode === "PREAPPROVED_ROSTER" && serial) {
          const [candidate] = await tx
            .select()
            .from(rosterEntries)
            .where(
              and(
                eq(rosterEntries.courseConfigId, config.id),
                eq(rosterEntries.serial, serial),
                eq(rosterEntries.status, "UNCLAIMED"),
              ),
            )
            .for("update")
            .limit(1);
          roster = candidate;
          this.assertRosterMatch(roster, fullName, email, phone);
        }

        const [duplicate] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            or(
              eq(users.normalizedEmail, email),
              eq(users.normalizedPhone, phone),
              ...(serial ? [eq(users.participantSerial, serial)] : []),
            ),
          )
          .limit(1);
        if (duplicate)
          throw new AppError("CONFLICT", 409, "These registration details are already in use.");

        const now = new Date();
        const passwordHash = await this.passwords.hash(input.password);
        const [user] = await tx
          .insert(users)
          .values({
            fullName,
            normalizedEmail: email,
            normalizedPhone: phone,
            passwordHash,
            participantSerial: serial,
          })
          .returning({ id: users.id });
        if (!user) throw new Error("Participant account was not created.");

        const device = await this.devices.createInitialRecord(tx, user.id, {
          userAgent: input.userAgent,
        });
        await tx.insert(roleAssignments).values({ userId: user.id, role: "PARTICIPANT" });
        await tx.insert(identificationPhotos).values({
          userId: user.id,
          objectKey: processed.objectKey,
          status: "ACTIVE",
          version: 1,
          contentType: processed.contentType,
          byteSize: processed.byteSize,
          width: processed.width,
          height: processed.height,
          checksum: processed.checksum,
          approvedAt: now,
        });
        if (roster) {
          await tx
            .update(rosterEntries)
            .set({
              status: "CLAIMED",
              claimedUserId: user.id,
              claimedAt: now,
              updatedAt: now,
              version: sql`${rosterEntries.version} + 1`,
            })
            .where(eq(rosterEntries.id, roster.id));
        }
        await this.accountTokens.issueVerification(user.id, email, fullName, tx);
        await this.audit.recordWith(tx, {
          actorUserId: user.id,
          actorRole: "PARTICIPANT",
          action: "PARTICIPANT_REGISTERED",
          targetType: "USER",
          targetId: user.id,
          correlationId: input.correlationId,
          afterValue: { role: "PARTICIPANT", serialNumber: serial },
        });
        return { userId: user.id, device };
      });
    } catch (error) {
      await this.photos.remove(processed.objectKey);
      if (isUniqueViolation(error)) {
        throw new AppError("CONFLICT", 409, "These registration details are already in use.");
      }
      throw error;
    }
  }

  private async defaultCourseConfig() {
    const [config] = await this.db
      .select()
      .from(courseConfig)
      .where(eq(courseConfig.singletonKey, "default"))
      .limit(1);
    if (!config) {
      throw new AppError(
        "COURSE_NOT_CONFIGURED",
        409,
        "Registration is not available yet. Please contact an Administrator.",
      );
    }
    return config;
  }

  private async assertIdentityAvailable(
    email: string,
    phone: string,
    serial: string,
  ): Promise<void> {
    const conditions = [
      eq(users.normalizedEmail, email),
      eq(users.normalizedPhone, phone),
      eq(users.participantSerial, serial),
    ];
    const [duplicate] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(or(...conditions))
      .limit(1);
    if (duplicate)
      throw new AppError("CONFLICT", 409, "These registration details are already in use.");
  }

  private assertRosterMatch(
    roster: typeof rosterEntries.$inferSelect | undefined,
    fullName: string,
    email: string,
    phone: string,
  ): void {
    if (!roster || roster.status !== "UNCLAIMED") {
      throw new AppError(
        "REGISTRATION_NOT_ELIGIBLE",
        409,
        "We could not match these details to an approved roster entry.",
      );
    }
    if (
      !namesMatch(roster.normalizedName, fullName) ||
      (roster.normalizedEmail !== null && roster.normalizedEmail !== email) ||
      (roster.normalizedPhone !== null && roster.normalizedPhone !== phone)
    ) {
      throw new AppError(
        "REGISTRATION_NOT_ELIGIBLE",
        409,
        "We could not match these details to an approved roster entry.",
      );
    }
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
