import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import configuration from "./config/configuration";
import { validateEnvironment } from "./config/env.validation";
import { HttpErrorFilter } from "./common/filters/http-error.filter";
import { OriginGuard } from "./common/guards/origin.guard";
import { SanitizedLoggerService } from "./common/logging/sanitized-logger.service";
import { RequestContextMiddleware } from "./common/middleware/request-context.middleware";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./infrastructure/jobs/jobs.module";
import { StorageModule } from "./infrastructure/storage/storage.module";
import { SecurityModule } from "./security/security.module";
import { IdentityModule } from "./identity/identity.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { SheetsModule } from "./sheets/sheets.module";
import { EmailModule } from "./infrastructure/email/email.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HealthModule,
    JobsModule,
    StorageModule,
    SecurityModule,
    IdentityModule,
    AttendanceModule,
    SheetsModule,
    EmailModule,
  ],
  providers: [
    SanitizedLoggerService,
    { provide: APP_FILTER, useClass: HttpErrorFilter },
    { provide: APP_GUARD, useClass: OriginGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
