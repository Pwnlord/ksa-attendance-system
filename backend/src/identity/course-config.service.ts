import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.module";
import { courseConfig } from "../database/schema";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "./audit.service";
import { CourseConfigUpdateDto } from "./dto/course-config.dto";

export const STANDARD_RATE_LIMITS = {
  failedLoginPerAccountIpPer15Minutes: 5,
  passwordResetPerEmailPerHour: 3,
  registrationPerIpPerHour: 50,
  registrationPerIdentityPerHour: 5,
  attendancePerAccountPerMinute: 10,
  privilegedAdminPerMinute: 20,
} as const;

@Injectable()
export class CourseConfigService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async get() {
    return this.toSafe(await this.getRecord());
  }

  async getRecord() {
    const [config] = await this.db
      .select()
      .from(courseConfig)
      .where(eq(courseConfig.singletonKey, "default"))
      .limit(1);
    if (!config) {
      throw new AppError(
        "COURSE_NOT_CONFIGURED",
        409,
        "Course configuration is not available yet. Please contact an Administrator.",
      );
    }
    return config;
  }

  async update(actorId: string, input: CourseConfigUpdateDto) {
    const updated = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(courseConfig)
        .where(
          and(
            eq(courseConfig.singletonKey, "default"),
            eq(courseConfig.version, input.expectedVersion),
          ),
        )
        .for("update")
        .limit(1);
      if (!current) {
        throw new AppError(
          "STALE_STATE",
          409,
          "The course configuration changed. Refresh and try again.",
        );
      }

      const next = this.validateMerged(current, input);
      const [result] = await tx
        .update(courseConfig)
        .set({
          courseLabel: next.courseLabel,
          timezone: next.timezone,
          registrationMode: next.registrationMode,
          venueLatitude: next.venueLatitude.toFixed(7),
          venueLongitude: next.venueLongitude.toFixed(7),
          geofenceRadiusMeters: next.geofenceRadiusMeters,
          maxAutomaticAccuracyMeters: next.maxAutomaticAccuracyMeters,
          clearlyRemoteBoundaryMeters: next.clearlyRemoteBoundaryMeters,
          locationFreshnessSeconds: next.locationFreshnessSeconds,
          locationTimeoutSeconds: next.locationTimeoutSeconds,
          defaultSessionDurationMinutes: next.defaultSessionDurationMinutes,
          manualCaseGraceMinutes: next.manualCaseGraceMinutes,
          photoRetentionDaysAfterCourse: next.photoRetentionDaysAfterCourse,
          failedLoginLimitPer15Minutes: next.failedLoginLimitPer15Minutes,
          passwordResetLimitPerHour: next.passwordResetLimitPerHour,
          registrationIpLimitPerHour: next.registrationIpLimitPerHour,
          registrationIdentityLimitPerHour: next.registrationIdentityLimitPerHour,
          attendanceLimitPerMinute: next.attendanceLimitPerMinute,
          privilegedAdminLimitPerMinute: next.privilegedAdminLimitPerMinute,
          onboardingOverrideExpiresAt: next.onboardingOverrideExpiresAt,
          version: sql`${courseConfig.version} + 1`,
          updatedAt: new Date(),
          updatedByUserId: actorId,
        })
        .where(
          and(eq(courseConfig.id, current.id), eq(courseConfig.version, input.expectedVersion)),
        )
        .returning();
      if (!result) {
        throw new AppError(
          "STALE_STATE",
          409,
          "The course configuration changed. Refresh and try again.",
        );
      }
      await this.audit.recordWith(tx, {
        actorUserId: actorId,
        actorRole: "ADMIN",
        action: "COURSE_CONFIG_UPDATED",
        targetType: "COURSE_CONFIG",
        targetId: current.id,
        reason: input.reason,
        beforeValue: { version: current.version, courseLabel: current.courseLabel },
        afterValue: { version: result.version, courseLabel: result.courseLabel },
      });
      return result;
    });
    return this.toSafe(updated);
  }

  private validateMerged(current: typeof courseConfig.$inferSelect, input: CourseConfigUpdateDto) {
    const venueLatitude = input.venueLatitude ?? Number(current.venueLatitude);
    const venueLongitude = input.venueLongitude ?? Number(current.venueLongitude);
    const geofenceRadiusMeters = input.geofenceRadiusMetres ?? current.geofenceRadiusMeters;
    const maxAutomaticAccuracyMeters =
      input.maxAutomaticAccuracyMetres ?? current.maxAutomaticAccuracyMeters;
    const clearlyRemoteBoundaryMeters =
      input.clearlyRemoteDistanceMetres ?? current.clearlyRemoteBoundaryMeters;
    if (clearlyRemoteBoundaryMeters <= geofenceRadiusMeters) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "The clearly-remote distance must be greater than the attendance radius.",
      );
    }
    if (input.registrationMode === "PILOT_FIRST_CLAIM_ADMIN_REVIEW") {
      throw new AppError(
        "CONFIGURATION_NOT_SUPPORTED",
        409,
        "Pilot first-claim registration is not enabled in this implementation.",
      );
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone ?? current.timezone }).format();
    } catch {
      throw new AppError("VALIDATION_ERROR", 400, "Enter a valid IANA timezone.");
    }

    const limits = input.rateLimits;
    let onboardingOverrideExpiresAt = current.onboardingOverrideExpiresAt;
    if (limits?.onboardingOverrideExpiresAt !== undefined) {
      onboardingOverrideExpiresAt = limits.onboardingOverrideExpiresAt
        ? new Date(limits.onboardingOverrideExpiresAt)
        : null;
      if (onboardingOverrideExpiresAt && onboardingOverrideExpiresAt <= new Date()) {
        throw new AppError(
          "VALIDATION_ERROR",
          400,
          "The onboarding override must expire in the future.",
        );
      }
    }
    return {
      courseLabel: input.courseLabel?.trim() || current.courseLabel,
      timezone: input.timezone ?? current.timezone,
      registrationMode: input.registrationMode ?? current.registrationMode,
      venueLatitude,
      venueLongitude,
      geofenceRadiusMeters,
      maxAutomaticAccuracyMeters,
      clearlyRemoteBoundaryMeters,
      locationFreshnessSeconds: input.locationFreshnessSeconds ?? current.locationFreshnessSeconds,
      locationTimeoutSeconds:
        input.locationAcquisitionTimeoutSeconds ?? current.locationTimeoutSeconds,
      defaultSessionDurationMinutes:
        input.defaultSessionDurationMinutes ?? current.defaultSessionDurationMinutes,
      manualCaseGraceMinutes: input.manualCaseGraceMinutes ?? current.manualCaseGraceMinutes,
      photoRetentionDaysAfterCourse:
        input.photoRetentionDaysAfterCourse ?? current.photoRetentionDaysAfterCourse,
      failedLoginLimitPer15Minutes:
        limits?.failedLoginPerAccountIpPer15Minutes ?? current.failedLoginLimitPer15Minutes,
      passwordResetLimitPerHour:
        limits?.passwordResetPerEmailPerHour ?? current.passwordResetLimitPerHour,
      registrationIpLimitPerHour:
        limits?.registrationPerIpPerHour ?? current.registrationIpLimitPerHour,
      registrationIdentityLimitPerHour:
        limits?.registrationPerIdentityPerHour ?? current.registrationIdentityLimitPerHour,
      attendanceLimitPerMinute:
        limits?.attendancePerAccountPerMinute ?? current.attendanceLimitPerMinute,
      privilegedAdminLimitPerMinute:
        limits?.privilegedAdminPerMinute ?? current.privilegedAdminLimitPerMinute,
      onboardingOverrideExpiresAt,
    };
  }

  private toSafe(config: typeof courseConfig.$inferSelect) {
    return {
      courseLabel: config.courseLabel,
      timezone: config.timezone,
      registrationMode: config.registrationMode,
      venueLatitude: Number(config.venueLatitude),
      venueLongitude: Number(config.venueLongitude),
      geofenceRadiusMetres: config.geofenceRadiusMeters,
      maxAutomaticAccuracyMetres: config.maxAutomaticAccuracyMeters,
      clearlyRemoteDistanceMetres: config.clearlyRemoteBoundaryMeters,
      locationFreshnessSeconds: config.locationFreshnessSeconds,
      locationAcquisitionTimeoutSeconds: config.locationTimeoutSeconds,
      defaultSessionDurationMinutes: config.defaultSessionDurationMinutes,
      manualCaseGraceMinutes: config.manualCaseGraceMinutes,
      photoRetentionDaysAfterCourse: config.photoRetentionDaysAfterCourse,
      rateLimits: {
        failedLoginPerAccountIpPer15Minutes: config.failedLoginLimitPer15Minutes,
        passwordResetPerEmailPerHour: config.passwordResetLimitPerHour,
        registrationPerIpPerHour: config.registrationIpLimitPerHour,
        registrationPerIdentityPerHour: config.registrationIdentityLimitPerHour,
        attendancePerAccountPerMinute: config.attendanceLimitPerMinute,
        privilegedAdminPerMinute: config.privilegedAdminLimitPerMinute,
        onboardingOverrideExpiresAt: config.onboardingOverrideExpiresAt?.toISOString() ?? null,
      },
      version: config.version,
    };
  }
}
