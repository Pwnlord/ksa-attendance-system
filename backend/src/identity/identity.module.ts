import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module";
import { JobsModule } from "../infrastructure/jobs/jobs.module";
import { StorageModule } from "../infrastructure/storage/storage.module";
import { SecurityModule } from "../security/security.module";
import { AccountTokenService } from "./account-token.service";
import { AdminController } from "./admin.controller";
import { AdminConfigController } from "./admin-config.controller";
import { AuditService } from "./audit.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./guards/auth.guard";
import { AdminRateLimitGuard } from "./guards/admin-rate-limit.guard";
import { RolesGuard } from "./guards/roles.guard";
import { IdentityService } from "./identity.service";
import { MeController } from "./me.controller";
import { PhotoChangeService } from "./photo-change.service";
import { PhotoService } from "./photo.service";
import { PhotoRetentionService } from "./photo-retention.service";
import { RateLimitService } from "./rate-limit.service";
import { RegistrationService } from "./registration.service";
import { RoleService } from "./role.service";
import { RosterService } from "./roster.service";
import { TokenProtectorService } from "./token-protector.service";
import { CourseConfigService } from "./course-config.service";

@Global()
@Module({
  imports: [DatabaseModule, JobsModule, SecurityModule, StorageModule],
  controllers: [AuthController, MeController, AdminController, AdminConfigController],
  providers: [
    AccountTokenService,
    AdminRateLimitGuard,
    AuditService,
    AuthGuard,
    IdentityService,
    PhotoChangeService,
    PhotoService,
    PhotoRetentionService,
    RateLimitService,
    RegistrationService,
    RoleService,
    RolesGuard,
    RosterService,
    TokenProtectorService,
    CourseConfigService,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_GUARD, useExisting: AdminRateLimitGuard },
  ],
  exports: [
    IdentityService,
    RoleService,
    AuditService,
    CourseConfigService,
    RateLimitService,
    PhotoService,
    TokenProtectorService,
  ],
})
export class IdentityModule {}
