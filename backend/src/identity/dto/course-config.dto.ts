import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class RateLimitConfigDto {
  @IsInt()
  @Min(1)
  failedLoginPerAccountIpPer15Minutes!: number;

  @IsInt()
  @Min(1)
  passwordResetPerEmailPerHour!: number;

  @IsInt()
  @Min(1)
  registrationPerIpPerHour!: number;

  @IsInt()
  @Min(1)
  registrationPerIdentityPerHour!: number;

  @IsInt()
  @Min(1)
  attendancePerAccountPerMinute!: number;

  @IsInt()
  @Min(1)
  privilegedAdminPerMinute!: number;

  @IsOptional()
  @IsDateString()
  onboardingOverrideExpiresAt?: string | null;
}

export class CourseConfigUpdateDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  courseLabel?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string;

  @IsOptional()
  @IsIn(["OPEN_REGISTRATION", "PREAPPROVED_ROSTER", "PILOT_FIRST_CLAIM_ADMIN_REVIEW"])
  registrationMode?:
    | "OPEN_REGISTRATION"
    | "PREAPPROVED_ROSTER"
    | "PILOT_FIRST_CLAIM_ADMIN_REVIEW";

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  venueLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  venueLongitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  geofenceRadiusMetres?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  maxAutomaticAccuracyMetres?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  clearlyRemoteDistanceMetres?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  locationFreshnessSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  locationAcquisitionTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultSessionDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  manualCaseGraceMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  photoRetentionDaysAfterCourse?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RateLimitConfigDto)
  rateLimits?: RateLimitConfigDto;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}
