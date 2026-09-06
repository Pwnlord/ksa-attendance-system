import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import type { ValidationError } from "class-validator";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AppError } from "./common/errors/app-error";
import { initializeSentry } from "./observability/sentry";

function validationMessage(constraint: string, message: string): string {
  const length = message.match(/(?:equal to|than) (\d+) characters/i)?.[1];
  switch (constraint) {
    case "isNotEmpty":
      return "This field is required.";
    case "isEmail":
      return "Enter a valid email address.";
    case "isLength":
      return length ? `Use the required length of ${length} characters.` : "Enter the correct number of characters.";
    case "minLength":
      return length ? `Use at least ${length} characters.` : "Enter more characters.";
    case "maxLength":
      return length ? `Use no more than ${length} characters.` : "Enter fewer characters.";
    case "isString":
      return "Enter text.";
    case "isNumber":
      return "Enter a number.";
    case "isInt":
      return "Enter a whole number.";
    case "isDateString":
      return "Enter a valid date.";
    case "isIn":
      return "Choose one of the available options.";
    case "isUUID":
      return "Choose a valid item.";
    case "isArray":
      return "Provide a list of items.";
    case "isObject":
      return "Provide valid settings.";
    default:
      return message.replace(/^\S+\s+/, "") || "Enter a valid value.";
  }
}

function validationDetails(errors: ValidationError[]): { fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  function collect(items: ValidationError[], parentPath = ""): void {
    for (const error of items) {
      const path = parentPath ? `${parentPath}.${error.property}` : error.property;
      const messages = Object.entries(error.constraints ?? {}).map(([constraint, message]) =>
        validationMessage(constraint, message),
      );
      if (messages.length > 0) fields[path] = messages;
      if (error.children?.length) collect(error.children, path);
    }
  }
  collect(errors);
  return { fields };
}

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
      exceptionFactory: (errors) =>
        new AppError(
          "VALIDATION_ERROR",
          400,
          "Please correct the highlighted fields.",
          validationDetails(errors),
        ),
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
