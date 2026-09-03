import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
  Min,
} from "class-validator";

export class RosterEntryUpdateDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @Length(2, 150)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @IsString()
  @Length(7, 30)
  phone?: string | null;

  @IsOptional()
  @IsDateString()
  enrollmentEffectiveDate?: string;

  @IsOptional()
  @IsIn(["UNCLAIMED", "CLAIMED", "DISABLED"])
  status?: "UNCLAIMED" | "CLAIMED" | "DISABLED";

  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class ReasonDto {
  @IsString()
  @Length(3, 1000)
  reason!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  currentPassword!: string;
}

export class AssignCourseRepDto extends ReasonDto {
  @IsUUID()
  participantId!: string;
}

export class GrantAdminDto extends ReasonDto {
  @IsUUID()
  userId!: string;
}

export class PhotoNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewDecisionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}
