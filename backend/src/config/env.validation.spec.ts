import { validateEnvironment } from "./env.validation";

function developmentEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://ksa:test@localhost:5432/ksa_attendance_test",
    ...overrides,
  };
}

describe("validateEnvironment", () => {
  it("accepts a valid local environment", () => {
    expect(validateEnvironment(developmentEnvironment())).toEqual(developmentEnvironment());
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() =>
      validateEnvironment(developmentEnvironment({ DATABASE_URL: "mysql://localhost/ksa" })),
    ).toThrow("DATABASE_URL must be a PostgreSQL connection URL");
  });

  it("requires secure production boundaries", () => {
    expect(() =>
      validateEnvironment(
        developmentEnvironment({
          NODE_ENV: "production",
          COOKIE_SECURE: "false",
          STORAGE_DRIVER: "memory",
        }),
      ),
    ).toThrow("COOKIE_SECURE must be true in production");
  });

  it("rejects invalid cookie names", () => {
    expect(() =>
      validateEnvironment(developmentEnvironment({ SESSION_COOKIE_NAME: "session;bad" })),
    ).toThrow("SESSION_COOKIE_NAME contains invalid cookie-name characters");
  });

  it("requires real production integrations and HTTPS origins", () => {
    expect(() =>
      validateEnvironment(
        developmentEnvironment({
          NODE_ENV: "production",
          COOKIE_SECURE: "true",
          TRUSTED_ORIGINS: "http://attendance.example.test",
          PUBLIC_APP_URL: "http://attendance.example.test",
          STORAGE_DRIVER: "r2",
          R2_ACCOUNT_ID: "account",
          R2_ACCESS_KEY_ID: "access",
          R2_SECRET_ACCESS_KEY: "secret",
          R2_BUCKET: "photos",
          R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
          AUTH_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
          EMAIL_DRIVER: "resend",
          RESEND_API_KEY: "re_123",
          RESEND_FROM_EMAIL: "Attendance <attendance@example.test>",
          GOOGLE_SHEETS_DRIVER: "google",
          GOOGLE_SHEETS_SPREADSHEET_ID: "sheet",
          GOOGLE_SERVICE_ACCOUNT_EMAIL: "worker@example.iam.gserviceaccount.com",
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "private-key",
          SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        }),
      ),
    ).toThrow("TRUSTED_ORIGINS entry 1 must use HTTPS in production");
  });

  it("does not permit API docs in production", () => {
    expect(() =>
      validateEnvironment(
        developmentEnvironment({
          NODE_ENV: "production",
          COOKIE_SECURE: "true",
          TRUSTED_ORIGINS: "https://attendance.example.test",
          PUBLIC_APP_URL: "https://attendance.example.test",
          STORAGE_DRIVER: "r2",
          R2_ACCOUNT_ID: "account",
          R2_ACCESS_KEY_ID: "access",
          R2_SECRET_ACCESS_KEY: "secret",
          R2_BUCKET: "photos",
          R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
          AUTH_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
          EMAIL_DRIVER: "resend",
          RESEND_API_KEY: "re_123",
          RESEND_FROM_EMAIL: "Attendance <attendance@example.test>",
          GOOGLE_SHEETS_DRIVER: "google",
          GOOGLE_SHEETS_SPREADSHEET_ID: "sheet",
          GOOGLE_SERVICE_ACCOUNT_EMAIL: "worker@example.iam.gserviceaccount.com",
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "private-key",
          SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
          API_DOCS_ENABLED: "true",
        }),
      ),
    ).toThrow("API_DOCS_ENABLED must be false in production");
  });
});
