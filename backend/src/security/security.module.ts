import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DeviceCredentialService } from "./attendance-device/device-credential.service";
import { PasswordHasherService } from "./password/password-hasher.service";
import { SessionService } from "./session/session.service";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [SessionService, DeviceCredentialService, PasswordHasherService],
  exports: [SessionService, DeviceCredentialService, PasswordHasherService],
})
export class SecurityModule {}
