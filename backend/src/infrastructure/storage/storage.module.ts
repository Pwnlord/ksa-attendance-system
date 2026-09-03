import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MemoryPrivateObjectStorage } from "./memory-private-object-storage.adapter";
import { PRIVATE_OBJECT_STORAGE } from "./private-object-storage.port";
import { R2PrivateObjectStorage } from "./r2-private-object-storage.adapter";

@Module({
  imports: [ConfigModule],
  providers: [
    MemoryPrivateObjectStorage,
    {
      provide: PRIVATE_OBJECT_STORAGE,
      inject: [ConfigService, MemoryPrivateObjectStorage],
      useFactory: (config: ConfigService, memory: MemoryPrivateObjectStorage) =>
        config.get<string>("app.storageDriver") === "r2"
          ? new R2PrivateObjectStorage(config)
          : memory,
    },
  ],
  exports: [PRIVATE_OBJECT_STORAGE],
})
export class StorageModule {}
