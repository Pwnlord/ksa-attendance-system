import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DatabaseModule } from "../database/database.module";
import { IdentityModule } from "../identity/identity.module";
import { JobsModule } from "../infrastructure/jobs/jobs.module";
import { GoogleSheetsProvider } from "./google-sheets.provider";
import { MemorySheetsProvider } from "./memory-sheets-provider";
import { SHEETS_PROVIDER } from "./sheets-provider.port";
import { SheetsController } from "./sheets.controller";
import { SheetsService } from "./sheets.service";

@Module({
  imports: [ConfigModule, DatabaseModule, IdentityModule, JobsModule],
  controllers: [SheetsController],
  providers: [
    GoogleSheetsProvider,
    MemorySheetsProvider,
    {
      provide: SHEETS_PROVIDER,
      inject: [ConfigService, GoogleSheetsProvider, MemorySheetsProvider],
      useFactory: (
        config: ConfigService,
        google: GoogleSheetsProvider,
        memory: MemorySheetsProvider,
      ) => (config.get<string>("app.sheets.driver") === "google" ? google : memory),
    },
    SheetsService,
  ],
  exports: [SheetsService, SHEETS_PROVIDER],
})
export class SheetsModule {}
