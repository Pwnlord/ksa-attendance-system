export type RuntimeEnvironment = "development" | "test" | "staging" | "production";

export interface AppConfig {
  environment: RuntimeEnvironment;
  deploymentProfile: "standard" | "zero-cost";
  port: number;
  apiPrefix: string;
  trustedOrigins: string[];
  publicAppUrl?: string;
  apiDocsEnabled: boolean;
  databaseUrl: string;
  databasePoolMax: number;
  databaseSsl: boolean;
  databaseSslRejectUnauthorized: boolean;
  sessionCookieName: string;
  attendanceDeviceCookieName: string;
  cookieSecure: boolean;
  sessionIdleDays: number;
  sessionAbsoluteDays: number;
  tokenEncryptionKey?: string;
  jobQueueDriver: "postgres";
  jobRunnerMode: "worker" | "endpoint";
  jobRunnerSecret?: string;
  emailDriver: "memory" | "resend";
  storageDriver: "memory" | "r2" | "supabase";
  r2: {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucket?: string;
    endpoint?: string;
    presignedUrlTtlSeconds: number;
  };
  supabase: {
    url?: string;
    serviceRoleKey?: string;
    bucket?: string;
  };
  resend: {
    apiKey?: string;
    fromEmail?: string;
  };
  sheets: {
    driver: "memory" | "google";
    spreadsheetId?: string;
    serviceAccountEmail?: string;
    privateKey?: string;
  };
  sentryDsn?: string;
}

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizedOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFrom(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export default (): { app: AppConfig } => ({
  app: {
    environment: (process.env.NODE_ENV ?? "development") as RuntimeEnvironment,
    deploymentProfile: process.env.DEPLOYMENT_PROFILE === "zero-cost" ? "zero-cost" : "standard",
    port: numberFrom(process.env.PORT, 3001),
    apiPrefix: process.env.API_PREFIX ?? "api/v1",
    trustedOrigins: csv(process.env.TRUSTED_ORIGINS).map(normalizedOrigin),
    publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:3000",
    apiDocsEnabled: booleanFrom(
      process.env.API_DOCS_ENABLED,
      process.env.NODE_ENV !== "production",
    ),
    databaseUrl: process.env.DATABASE_URL ?? "",
    databasePoolMax: numberFrom(process.env.DATABASE_POOL_MAX, 10),
    databaseSsl: booleanFrom(process.env.DATABASE_SSL, false),
    databaseSslRejectUnauthorized: booleanFrom(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, true),
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "ksa_session",
    attendanceDeviceCookieName:
      process.env.ATTENDANCE_DEVICE_COOKIE_NAME ?? "ksa_attendance_device",
    cookieSecure: booleanFrom(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
    sessionIdleDays: numberFrom(process.env.SESSION_IDLE_DAYS, 30),
    sessionAbsoluteDays: numberFrom(process.env.SESSION_ABSOLUTE_DAYS, 90),
    tokenEncryptionKey: process.env.AUTH_TOKEN_ENCRYPTION_KEY,
    jobQueueDriver: "postgres",
    jobRunnerMode: process.env.JOB_RUNNER_MODE === "endpoint" ? "endpoint" : "worker",
    jobRunnerSecret: process.env.JOB_RUNNER_SECRET,
    emailDriver: process.env.EMAIL_DRIVER === "resend" ? "resend" : "memory",
    storageDriver:
      process.env.STORAGE_DRIVER === "r2"
        ? "r2"
        : process.env.STORAGE_DRIVER === "supabase"
          ? "supabase"
          : "memory",
    r2: {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
      endpoint: process.env.R2_ENDPOINT,
      presignedUrlTtlSeconds: numberFrom(process.env.R2_PRESIGNED_URL_TTL_SECONDS, 300),
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      bucket: process.env.SUPABASE_STORAGE_BUCKET,
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL,
    },
    sheets: {
      driver: process.env.GOOGLE_SHEETS_DRIVER === "google" ? "google" : "memory",
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    },
    sentryDsn: process.env.SENTRY_DSN,
  },
});
