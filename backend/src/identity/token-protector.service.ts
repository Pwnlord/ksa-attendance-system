import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyFrom(value: string | undefined, environment: string): Buffer {
  if (!value && (environment === "development" || environment === "test")) {
    return createHash("sha256").update("ksa-local-development-only").digest();
  }
  if (!value) throw new Error("AUTH_TOKEN_ENCRYPTION_KEY is required for token protection.");
  const key = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64url");
  if (key.length !== 32) throw new Error("AUTH_TOKEN_ENCRYPTION_KEY must contain 32 bytes.");
  return key;
}

@Injectable()
export class TokenProtectorService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = keyFrom(
      config.get<string>("app.tokenEncryptionKey"),
      config.get<string>("app.environment", "development"),
    );
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
  }

  decrypt(value: string): string {
    const [ivValue, tagValue, ciphertextValue] = value.split(".");
    if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid protected token.");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
