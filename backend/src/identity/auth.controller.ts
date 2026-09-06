import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { Public } from "../common/decorators/public.decorator";
import { AppError } from "../common/errors/app-error";
import { SessionService } from "../security/session/session.service";
import { DeviceCredentialService } from "../security/attendance-device/device-credential.service";
import { AccountTokenService } from "./account-token.service";
import { RateLimitService } from "./rate-limit.service";
import { IdentityService } from "./identity.service";
import { RegistrationService } from "./registration.service";
import {
  ForgotPasswordDto,
  LoginDto,
  RegistrationDto,
  ResetPasswordDto,
  TokenDto,
} from "./dto/auth.dto";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { AuthRequestContext } from "./decorators/current-user.decorator";
import { normalizeEmail } from "./normalization";
import { MAX_PHOTO_BYTES } from "./identity.constants";
import { CourseConfigService } from "./course-config.service";
import { RoleService } from "./role.service";

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly devices: DeviceCredentialService,
    private readonly accountTokens: AccountTokenService,
    private readonly limits: RateLimitService,
    private readonly config: ConfigService,
    private readonly courseConfig: CourseConfigService,
    private readonly roles: RoleService,
  ) {}

  @Post("register")
  @Public()
  @UseInterceptors(
    FileInterceptor("identificationPhoto", { limits: { fileSize: MAX_PHOTO_BYTES } }),
  )
  async register(
    @Body() input: RegistrationDto,
    @UploadedFile()
    file: { buffer: Buffer; size: number; mimetype?: string; originalname?: string } | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const deviceCookieName = this.config.getOrThrow<string>("app.attendanceDeviceCookieName");
    const existingDevice = await this.devices.findByToken(request.cookies?.[deviceCookieName]);
    if (existingDevice) {
      throw new AppError(
        "BROWSER_ASSIGNED_TO_OTHER_ACCOUNT",
        409,
        "This browser is already assigned to another participant account. Use a different browser profile to create an account.",
      );
    }
    const ip = request.ip ?? "unknown";
    const courseConfig = await this.courseConfig.getRecord();
    const normalizedEmail = normalizeEmail(input.email);
    await this.limits.assertAllowed(
      `registration:ip:${fingerprint(ip)}`,
      courseConfig.registrationIpLimitPerHour,
      60 * 60 * 1000,
      response,
    );
    await this.limits.assertAllowed(
      `registration:email:${fingerprint(normalizedEmail)}`,
      courseConfig.registrationIdentityLimitPerHour,
      60 * 60 * 1000,
      response,
    );
    await this.limits.assertAllowed(
      `registration:serial:${fingerprint(input.serialNumber.trim().toUpperCase())}`,
      courseConfig.registrationIdentityLimitPerHour,
      60 * 60 * 1000,
      response,
    );

    const result = await this.registration.register({
      ...input,
      identificationPhoto: file,
      ipAddress: ip,
      userAgent: request.get("user-agent") ?? undefined,
      correlationId: request.correlationId,
    });
    this.devices.bindCreatedDevice(response, result.device);
    await this.sessions.create(
      result.userId,
      { ipAddress: ip, userAgent: request.get("user-agent") ?? undefined },
      response,
    );
    return this.identity.authenticatedEnvelope(result.userId, "REGISTERED_BROWSER");
  }

  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ip = request.ip ?? "unknown";
    const key = `login:${fingerprint(input.identifier.trim().toLowerCase())}:${fingerprint(ip)}`;
    const user = await this.identity.authenticate(input.identifier, input.password);
    if (!user) {
      const courseConfig = await this.courseConfig.getRecord();
      await this.limits.assertAllowed(
        key,
        courseConfig.failedLoginLimitPer15Minutes,
        15 * 60 * 1000,
        response,
      );
      throw new AppError("AUTHENTICATION_REQUIRED", 401, "The sign-in details are not correct.");
    }

    if (await this.roles.hasAny(user.id, ["PARTICIPANT"])) {
      const deviceCookieName = this.config.getOrThrow<string>("app.attendanceDeviceCookieName");
      const existingDevice = await this.devices.findByToken(request.cookies?.[deviceCookieName]);
      if (existingDevice && existingDevice.userId !== user.id) {
        throw new AppError(
          "BROWSER_ASSIGNED_TO_OTHER_ACCOUNT",
          409,
          "This browser is already assigned to another participant account. Use that account or a different browser profile.",
        );
      }
    }

    await this.sessions.create(
      user.id,
      { ipAddress: ip, userAgent: request.get("user-agent") ?? undefined },
      response,
    );
    const cookieName = this.config.getOrThrow<string>("app.attendanceDeviceCookieName");
    const deviceStatus = await this.devices.browserStatus(user.id, request.cookies?.[cookieName]);
    return this.identity.authenticatedEnvelope(user.id, deviceStatus);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookieName = this.config.getOrThrow<string>("app.sessionCookieName");
    await this.sessions.revoke(request.cookies?.[cookieName], response);
  }

  @Get("session")
  async session(@CurrentUser() auth: AuthRequestContext, @Req() request: Request) {
    const cookieName = this.config.getOrThrow<string>("app.attendanceDeviceCookieName");
    const deviceStatus = await this.devices.browserStatus(
      auth.userId,
      request.cookies?.[cookieName],
    );
    return this.identity.authenticatedEnvelope(auth.userId, deviceStatus);
  }

  @Post("email-verification/resend")
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@CurrentUser() auth: AuthRequestContext): Promise<void> {
    const user = await this.identity.findById(auth.userId);
    if (user && !user.emailVerifiedAt && user.normalizedEmail) {
      await this.accountTokens.issueVerification(user.id, user.normalizedEmail, user.fullName);
    }
  }

  @Post("email-verification/confirm")
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmVerification(@Body() input: TokenDto): Promise<void> {
    if (!(await this.accountTokens.confirmEmail(input.token))) {
      throw new AppError("INVALID_TOKEN", 400, "This verification link is invalid or has expired.");
    }
  }

  @Post("password/forgot")
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body() input: ForgotPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const email = normalizeEmail(input.identifier);
    const courseConfig = await this.courseConfig.getRecord();
    await this.limits.assertAllowed(
      `password-reset:${fingerprint(email)}`,
      courseConfig.passwordResetLimitPerHour,
      60 * 60 * 1000,
      response,
    );
    const user = email.includes("@") ? await this.identity.findByIdentifier(email) : undefined;
    if (user?.emailVerifiedAt && user.normalizedEmail && user.accountStatus === "ACTIVE") {
      await this.accountTokens.issuePasswordReset(user.id, user.normalizedEmail, user.fullName);
    }
  }

  @Post("password/reset")
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() input: ResetPasswordDto): Promise<void> {
    const passwordHash = await this.identity.hashPassword(input.password);
    const userId = await this.accountTokens.consumePasswordReset(input.token, passwordHash);
    if (!userId)
      throw new AppError(
        "INVALID_TOKEN",
        400,
        "This password-reset link is invalid or has expired.",
      );
    await this.sessions.revokeAllForUser(userId);
  }
}
