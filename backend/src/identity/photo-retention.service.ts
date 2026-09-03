import { Inject, Injectable } from "@nestjs/common";
import { and, eq, lte } from "drizzle-orm";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.module";
import { identificationPhotos } from "../database/schema";
import {
  PRIVATE_OBJECT_STORAGE,
  PrivateObjectStorage,
} from "../infrastructure/storage/private-object-storage.port";
import { AuditService } from "./audit.service";

function photoIdFrom(payload: unknown): string {
  if (!payload || typeof payload !== "object")
    throw new Error("Photo-retention payload is invalid.");
  const photoId = (payload as { photoId?: unknown }).photoId;
  if (typeof photoId !== "string" || photoId.length === 0)
    throw new Error("Photo-retention payload is invalid.");
  return photoId;
}

@Injectable()
export class PhotoRetentionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    private readonly audit: AuditService,
  ) {}

  async processJob(payload: unknown): Promise<void> {
    const photoId = photoIdFrom(payload);
    const [photo] = await this.db
      .select({ id: identificationPhotos.id, objectKey: identificationPhotos.objectKey })
      .from(identificationPhotos)
      .where(
        and(
          eq(identificationPhotos.id, photoId),
          eq(identificationPhotos.status, "SUPERSEDED"),
          lte(identificationPhotos.retentionDeleteAt, new Date()),
        ),
      )
      .limit(1);
    if (!photo) return;

    // Deleting the object first keeps a failed storage call retryable. R2 and
    // the local adapter treat a repeated delete as safe for this job.
    await this.storage.delete(photo.objectKey);
    await this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(identificationPhotos)
        .set({ status: "DELETED" })
        .where(
          and(
            eq(identificationPhotos.id, photo.id),
            eq(identificationPhotos.status, "SUPERSEDED"),
            lte(identificationPhotos.retentionDeleteAt, new Date()),
          ),
        )
        .returning({ id: identificationPhotos.id });
      if (!deleted) return;
      await this.audit.recordWith(tx, {
        actorRole: "SYSTEM",
        action: "PHOTO_RETENTION_DELETED",
        targetType: "IDENTIFICATION_PHOTO",
        targetId: deleted.id,
        beforeValue: { status: "SUPERSEDED" },
        afterValue: { status: "DELETED" },
      });
    });
  }
}
