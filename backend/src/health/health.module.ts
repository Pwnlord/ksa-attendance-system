import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DatabaseHealthIndicator } from "./database-health.indicator";
import { HealthController } from "./health.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}
