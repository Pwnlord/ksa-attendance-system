import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from "class-validator";

export class RegistrationDto {
  @IsString()
  @Length(2, 150)
  fullName!: string;

  @IsString()
  @Length(7, 30)
  phone!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;

  @IsString()
  @Length(1, 32)
  serialNumber!: string;
}

export class LoginDto {
  @IsString()
  @Length(1, 320)
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}

export class TokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(2048)
  token!: string;
}

export class ForgotPasswordDto {
  @IsString()
  @Length(1, 320)
  identifier!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(16)
  @MaxLength(2048)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;
}

export class ProfileUpdateDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(7, 30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  currentPassword?: string;
}
