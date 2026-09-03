import sharp from "sharp";
import type { PrivateObjectStorage } from "../infrastructure/storage/private-object-storage.port";
import { PhotoService } from "./photo.service";

describe("PhotoService", () => {
  it("re-encodes, strips metadata, and bounds the longest edge", async () => {
    const storage: PrivateObjectStorage = {
      put: jest.fn(),
      createReadUrl: jest.fn(),
      delete: jest.fn(),
    };
    const service = new PhotoService(storage);
    const source = await sharp({
      create: { width: 2200, height: 1100, channels: 3, background: { r: 20, g: 80, b: 120 } },
    })
      .withMetadata({ density: 72 })
      .png()
      .toBuffer();

    const processed = await service.process({ buffer: source, size: source.length });
    const metadata = await sharp(processed.body).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600);
    expect(metadata.exif).toBeUndefined();
    expect(processed.contentType).toBe("image/jpeg");
    expect(processed.objectKey).toMatch(/^identification-photos\/.+\.jpg$/);
  });
});
