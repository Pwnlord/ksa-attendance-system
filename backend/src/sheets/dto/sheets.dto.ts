import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { SheetsReconcileScope } from "../sheets-job-types";

export class SheetsRetryDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("4", { each: true })
  jobIds?: string[];
}

export class SheetsReconcileDto {
  @IsIn(["MASTER_REGISTER", "SESSION", "SUMMARY", "FULL"])
  scope!: SheetsReconcileScope;

  @IsOptional()
  @IsUUID("4")
  sessionId?: string;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}
