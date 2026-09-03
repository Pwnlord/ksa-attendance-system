import type { Database } from "../database/database.module";
import type { PrivateObjectStorage } from "../infrastructure/storage/private-object-storage.port";
import { PhotoRetentionService } from "./photo-retention.service";

function databaseWith(photo: { id: string; objectKey: string } | undefined) {
  const updateReturning = jest.fn().mockResolvedValue(photo ? [{ id: photo.id }] : []);
  const tx = {
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ returning: updateReturning }),
      }),
    }),
  };
  const db = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest
          .fn()
          .mockReturnValue({ limit: jest.fn().mockResolvedValue(photo ? [photo] : []) }),
      }),
    }),
    transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
  };
  return { db: db as unknown as Database, tx, updateReturning };
}

function storage(): PrivateObjectStorage & { delete: jest.Mock } {
  return {
    put: jest.fn(),
    createReadUrl: jest.fn(),
    delete: jest.fn(),
  };
}

describe("PhotoRetentionService", () => {
  it("deletes an eligible private object before marking its database row deleted", async () => {
    const current = { id: "photo-1", objectKey: "identification-photos/photo-1.jpg" };
    const { db, tx } = databaseWith(current);
    const privateStorage = storage();
    const audit = { recordWith: jest.fn().mockResolvedValue(undefined) };
    const service = new PhotoRetentionService(db, privateStorage, audit as never);

    await service.processJob({ photoId: current.id });

    expect(privateStorage.delete).toHaveBeenCalledWith(current.objectKey);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(audit.recordWith).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorRole: "SYSTEM",
        action: "PHOTO_RETENTION_DELETED",
        targetId: current.id,
      }),
    );
  });

  it("does nothing when the photo is no longer eligible", async () => {
    const { db } = databaseWith(undefined);
    const privateStorage = storage();
    const service = new PhotoRetentionService(db, privateStorage, {
      recordWith: jest.fn(),
    } as never);

    await service.processJob({ photoId: "photo-1" });

    expect(privateStorage.delete).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("leaves the database row retryable when storage deletion fails", async () => {
    const current = { id: "photo-1", objectKey: "identification-photos/photo-1.jpg" };
    const { db } = databaseWith(current);
    const privateStorage = storage();
    privateStorage.delete.mockRejectedValue(new Error("storage unavailable"));
    const service = new PhotoRetentionService(db, privateStorage, {
      recordWith: jest.fn(),
    } as never);

    await expect(service.processJob({ photoId: current.id })).rejects.toThrow(
      "storage unavailable",
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed job payloads", async () => {
    const { db } = databaseWith(undefined);
    const service = new PhotoRetentionService(db, storage(), { recordWith: jest.fn() } as never);

    await expect(service.processJob({ photoId: "" })).rejects.toThrow(
      "Photo-retention payload is invalid.",
    );
  });
});
