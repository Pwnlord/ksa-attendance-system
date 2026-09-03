import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { initializeSentry } from "./observability/sentry";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const apiPrefix = config.getOrThrow<string>("app.apiPrefix");
  const trustedOrigins = config.get<string[]>("app.trustedOrigins", []);
  const environment = config.get<string>("app.environment", "development");
  initializeSentry(config);

  if (environment === "staging" || environment === "production") {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }
  app.enableShutdownHooks();
  app.use(cookieParser());
  app.use(helmet(environment === "production" ? undefined : { contentSecurityPolicy: false }));
  app.enableCors(
    trustedOrigins.length > 0 ? { origin: trustedOrigins, credentials: true } : { origin: false },
  );
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );

  if (config.get<boolean>("app.apiDocsEnabled", false)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("KSA Attendance System API")
      .setDescription("Authoritative API foundation. The database remains the source of truth.")
      .setVersion("0.2.0")
      .addCookieAuth(config.getOrThrow<string>("app.sessionCookieName"), {
        type: "http",
        in: "cookie",
        scheme: "bearer",
      })
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: { persistAuthorization: false },
    });
  }

  await app.listen(config.get<number>("app.port", 3001));
}

void bootstrap();
