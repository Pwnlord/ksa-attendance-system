import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TokenProtectorService } from "../../identity/token-protector.service";
import { EMAIL_VERIFICATION_JOB, PASSWORD_RESET_JOB } from "../../identity/identity.constants";
import { EMAIL_PROVIDER, EmailProvider } from "./email-provider.port";

interface ProtectedDelivery {
  token: string;
  email: string;
  fullName: string;
}

function deliveryFrom(payload: unknown, protector: TokenProtectorService): ProtectedDelivery {
  if (!payload || typeof payload !== "object") throw new Error("Email job payload is invalid.");
  const protectedDelivery = (payload as { protectedDelivery?: unknown }).protectedDelivery;
  if (typeof protectedDelivery !== "string") throw new Error("Email job payload is invalid.");
  const decoded = JSON.parse(protector.decrypt(protectedDelivery)) as Partial<ProtectedDelivery>;
  if (
    typeof decoded.token !== "string" ||
    typeof decoded.email !== "string" ||
    typeof decoded.fullName !== "string"
  )
    throw new Error("Email job payload is invalid.");
  return { token: decoded.token, email: decoded.email, fullName: decoded.fullName };
}

@Injectable()
export class TransactionalEmailService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly protector: TokenProtectorService,
    private readonly config: ConfigService,
  ) {}

  async processJob(jobType: string, payload: unknown): Promise<void> {
    if (jobType !== EMAIL_VERIFICATION_JOB && jobType !== PASSWORD_RESET_JOB) {
      throw new Error("Unsupported email job type.");
    }
    const delivery = deliveryFrom(payload, this.protector);
    const publicAppUrl = this.config.getOrThrow<string>("app.publicAppUrl").replace(/\/$/, "");
    const verification = jobType === EMAIL_VERIFICATION_JOB;
    const link = `${publicAppUrl}/${verification ? "verify-email" : "reset-password"}?token=${encodeURIComponent(delivery.token)}`;
    await this.provider.send({
      to: delivery.email,
      subject: verification
        ? "Verify your Kora Attendance email"
        : "Reset your Kora Attendance password",
      text: verification
        ? `Hello ${delivery.fullName},\n\nVerify your email for Kora Sales Academy attendance:\n${link}\n\nThis link expires in 24 hours. Email verification is not required for attendance.`
        : `Hello ${delivery.fullName},\n\nReset your Kora Sales Academy attendance password here:\n${link}\n\nThis link expires in 1 hour. Resetting your password does not approve a new attendance browser.`,
    });
  }
}
