import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  PRIVATE_OBJECT_STORAGE,
  PrivateObjectStorage,
} from "../infrastructure/storage/private-object-storage.port";
import { AppError } from "../common/errors/app-error";
import { MAX_PHOTO_BYTES } from "./identity.constants";
import sharp from "sharp";

export interface UploadFile {
  buffer: Buffer;
  size: number;
  mimetype?: string;
  originalname?: string;
}

export interface ProcessedPhoto {
  body: Buffer;
  objectKey: string;
  contentType: "image/jpeg";
  byteSize: number;
  width: number;
  height: number;
  checksum: string;
}

@Injectable()
export class PhotoService {
  constructor(@Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage) {}

  async process(file: UploadFile | undefined): Promise<ProcessedPhoto> {
    if (!file?.buffer) {
      throw new AppError("PHOTO_UNSUPPORTED", 400, "A valid identification photo is required.");
    }
    if (file.size > MAX_PHOTO_BYTES || file.buffer.length > MAX_PHOTO_BYTES) {
      throw new AppError("PHOTO_TOO_LARGE", 400, "The photo must be 8 MB or smaller.");
    }

    try {
      const image = sharp(file.buffer, { failOn: "error", limitInputPixels: 25_000_000 });
      const metadata = await image.metadata();
      if (
        !metadata.format ||
        !["jpeg", "png", "webp", "gif", "avif", "tiff"].includes(metadata.format)
      ) {
        throw new Error("Unsupported image format");
      }
      const result = await image
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      if (!result.info.width || !result.info.height)
        throw new Error("Image dimensions unavailable");

      return {
        body: result.data,
        objectKey: `identification-photos/${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        byteSize: result.data.length,
        width: result.info.width,
        height: result.info.height,
        checksum: createHash("sha256").update(result.data).digest("hex"),
      };
    } catch {
      throw new AppError(
        "PHOTO_UNSUPPORTED",
        400,
        "Upload a clear JPG, PNG, or WebP image that can be processed safely.",
      );
    }
  }

  async store(photo: ProcessedPhoto): Promise<void> {
    await this.storage.put(photo.objectKey, photo.body, {
      contentType: photo.contentType,
      byteSize: photo.byteSize,
      checksum: photo.checksum,
    });
  }

  async remove(objectKey: string): Promise<void> {
    await this.storage.delete(objectKey);
  }

  async createReadUrl(objectKey: string, ttlSeconds = 300): Promise<string> {
    return this.storage.createReadUrl(objectKey, Math.min(Math.max(ttlSeconds, 60), 600));
  }
}
