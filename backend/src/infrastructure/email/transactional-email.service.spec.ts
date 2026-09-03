import { ConfigService } from "@nestjs/config";
import { TokenProtectorService } from "../../identity/token-protector.service";
import { MemoryEmailProvider } from "./memory-email.provider";
import { TransactionalEmailService } from "./transactional-email.service";

describe("TransactionalEmailService", () => {
  function service() {
    const config = new ConfigService({
      app: { environment: "test", publicAppUrl: "http://localhost:3000" },
    });
    const provider = new MemoryEmailProvider();
    const protector = new TokenProtectorService(config);
    return {
      provider,
      protector,
      service: new TransactionalEmailService(provider, protector, config),
    };
  }

  it("delivers verification links from protected durable job payloads", async () => {
    const current = service();
    const protectedDelivery = current.protector.encrypt(
      JSON.stringify({ token: "verification-token", email: "ada@example.test", fullName: "Ada" }),
    );

    await current.service.processJob("EMAIL_VERIFICATION", { protectedDelivery });

    expect(current.provider.messages).toHaveLength(1);
    expect(current.provider.messages[0]).toMatchObject({
      to: "ada@example.test",
      subject: "Verify your Kora Attendance email",
    });
    expect(current.provider.messages[0]?.text).toContain(
      "http://localhost:3000/verify-email?token=verification-token",
    );
  });

  it("delivers password-reset links without exposing the protected payload", async () => {
    const current = service();
    const protectedDelivery = current.protector.encrypt(
      JSON.stringify({ token: "reset-token", email: "ada@example.test", fullName: "Ada" }),
    );

    await current.service.processJob("PASSWORD_RESET", { protectedDelivery });

    expect(current.provider.messages[0]).toMatchObject({
      to: "ada@example.test",
      subject: "Reset your Kora Attendance password",
    });
    expect(current.provider.messages[0]?.text).toContain(
      "http://localhost:3000/reset-password?token=reset-token",
    );
    expect(current.provider.messages[0]?.text).not.toContain("protectedDelivery");
  });
});
