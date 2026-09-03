import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class LocationReadingDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsNumber()
  @Min(0.001)
  accuracyMetres!: number;

  @IsDateString()
  capturedAt!: string;
}

export class CheckInDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationReadingDto)
  location?: LocationReadingDto;

  @IsOptional()
  @IsIn(["PERMISSION_DENIED", "TIMEOUT", "UNAVAILABLE", "UNSUPPORTED"])
  locationFailure?: "PERMISSION_DENIED" | "TIMEOUT" | "UNAVAILABLE" | "UNSUPPORTED";
}
