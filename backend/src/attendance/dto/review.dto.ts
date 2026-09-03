import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class ManualVerificationRequestDto {
  @IsUUID()
  attemptId!: string;

  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class DeviceChangeRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewDecisionRequestDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class EmergencyAttendanceDto {
  @IsUUID()
  participantId!: string;

  @IsUUID()
  sessionId!: string;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class AttendanceCorrectionDto {
  @IsUUID()
  sessionId!: string;

  @IsUUID()
  participantId!: string;

  @IsIn(["PRESENT", "ABSENT", "NOT_APPLICABLE"])
  targetStatus!: "PRESENT" | "ABSENT" | "NOT_APPLICABLE";

  @IsOptional()
  @IsDateString()
  checkedInAt?: string | null;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class ParticipantSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  query!: string;
}
