import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AppError } from "../../common/errors/app-error";
import { PrivateObjectMetadata, PrivateObjectStorage } from "./private-object-storage.port";

@Injectable()
export class MemoryPrivateObjectStorage implements PrivateObjectStorage {
  private readonly objects = new Map<string, { body: Buffer; metadata: PrivateObjectMetadata }>();

  async put(key: string, body: Buffer, metadata: PrivateObjectMetadata): Promise<void> {
    const checksum = createHash("sha256").update(body).digest("hex");
    if (checksum !== metadata.checksum) {
      throw new AppError(
        "STORAGE_CHECKSUM_MISMATCH",
        400,
        "The private file could not be stored safely.",
      );
    }
    this.objects.set(key, { body: Buffer.from(body), metadata });
  }

  async createReadUrl(key: string, _expiresInSeconds: number): Promise<string> {
    if (!this.objects.has(key)) {
      throw new AppError("NOT_FOUND", 404, "The requested private file was not found.");
    }
    return `memory://private/${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
