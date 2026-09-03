import * as Sentry from "@sentry/node";
import type { ConfigService } from "@nestjs/config";

export function initializeSentry(config: ConfigService): void {
  const dsn = config.get<string>("app.sentryDsn");
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: config.get<string>("app.environment", "development"),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      // Keep stack traces useful while stripping request/user material that can
      // contain names, serials, emails, cookies, coordinates, or credentials.
      delete event.request;
      delete event.user;
      delete event.breadcrumbs;
      return event;
    },
  });
}

export function captureSanitizedError(
  message: string,
  tags: Record<string, string | number | boolean> = {},
): void {
  Sentry.withScope((scope) => {
    for (const [name, value] of Object.entries(tags)) scope.setTag(name, String(value));
    Sentry.captureException(new Error(message));
  });
}
