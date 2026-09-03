import { ConfigService } from "@nestjs/config";
import { TokenProtectorService } from "./token-protector.service";

describe("TokenProtectorService", () => {
  it("protects and restores queued delivery content", () => {
    const service = new TokenProtectorService(new ConfigService({ app: { environment: "test" } }));
    const plaintext = JSON.stringify({ token: "one-time-token", email: "person@example.test" });
    const protectedValue = service.encrypt(plaintext);

    expect(protectedValue).not.toContain("one-time-token");
    expect(service.decrypt(protectedValue)).toBe(plaintext);
  });
});
