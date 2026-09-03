import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Min } from "class-validator";

export class CreateSessionDto {
  @IsDateString({ strict: true })
  attendanceDate!: string;

  @IsDateString()
  effectiveStart!: string;

  @IsOptional()
  @IsDateString()
  effectiveEnd?: string;

  @IsIn(["DRAFT", "SCHEDULED", "OPEN"])
  initialStatus!: "DRAFT" | "SCHEDULED" | "OPEN";
}

export class VersionedCommandDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ReasonedVersionedCommandDto extends VersionedCommandDto {
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class ExtendSessionDto extends VersionedCommandDto {
  @IsDateString()
  effectiveEnd!: string;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class ReopenSessionDto extends ReasonedVersionedCommandDto {
  @IsDateString()
  effectiveEnd!: string;
}
