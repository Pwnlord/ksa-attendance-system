import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { IdentityModule } from "../../identity/identity.module";
import { EMAIL_PROVIDER } from "./email-provider.port";
import { MemoryEmailProvider } from "./memory-email.provider";
import { ResendEmailProvider } from "./resend-email.provider";
import { TransactionalEmailService } from "./transactional-email.service";

@Module({
  imports: [ConfigModule, IdentityModule],
  providers: [
    MemoryEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService, MemoryEmailProvider],
      useFactory: (config: ConfigService, memory: MemoryEmailProvider) =>
        config.get<string>("app.emailDriver") === "resend"
          ? new ResendEmailProvider(config)
          : memory,
    },
    TransactionalEmailService,
  ],
  exports: [TransactionalEmailService],
})
export class EmailModule {}
