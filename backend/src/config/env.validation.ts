const environmentValues = new Set(["development", "test", "staging", "production"]);

function requireValue(env: NodeJS.ProcessEnv, name: string, errors: string[]): string {
  const value = env[name]?.trim();
  if (!value) errors.push(`${name} is required`);
  return value ?? "";
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  errors: string[],
): void {
  const value = env[name] ?? String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1) errors.push(`${name} must be a positive integer`);
}

function validateOrigin(
  value: string,
  name: string,
  errors: string[],
  requireHttps: boolean,
): void {
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      errors.push(`${name} must be an origin without a path or credentials`);
    }
    if (requireHttps && parsed.protocol !== "https:")
      errors.push(`${name} must use HTTPS in production`);
  } catch {
    errors.push(`${name} must be a valid HTTP(S) origin`);
  }
}

export function validateEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const errors: string[] = [];
  const environment = env.NODE_ENV ?? "development";
  const deploymentProfile = env.DEPLOYMENT_PROFILE ?? "standard";
  const jobRunnerMode = env.JOB_RUNNER_MODE ?? "worker";

  if (!environmentValues.has(environment)) {
    errors.push(`NODE_ENV must be one of: ${[...environmentValues].join(", ")}`);
  }

  if (deploymentProfile !== "standard" && deploymentProfile !== "zero-cost") {
    errors.push("DEPLOYMENT_PROFILE must be standard or zero-cost");
  }
  if (jobRunnerMode !== "worker" && jobRunnerMode !== "endpoint") {
    errors.push("JOB_RUNNER_MODE must be worker or endpoint");
  }

  const databaseUrl = requireValue(env, "DATABASE_URL", errors);
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push("DATABASE_URL must be a PostgreSQL connection URL");
  }

  positiveInteger(env, "PORT", 3001, errors);
  positiveInteger(env, "DATABASE_POOL_MAX", 10, errors);
  positiveInteger(env, "SESSION_IDLE_DAYS", 30, errors);
  positiveInteger(env, "SESSION_ABSOLUTE_DAYS", 90, errors);
  positiveInteger(env, "R2_PRESIGNED_URL_TTL_SECONDS", 300, errors);

  const databaseSsl = env.DATABASE_SSL ?? "false";
  if (databaseSsl !== "true" && databaseSsl !== "false") {
    errors.push("DATABASE_SSL must be true or false");
  }
  const databaseSslVerification = env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? "true";
  if (databaseSslVerification !== "true" && databaseSslVerification !== "false") {
    errors.push("DATABASE_SSL_REJECT_UNAUTHORIZED must be true or false");
  }

  if (jobRunnerMode === "endpoint" && (environment === "staging" || environment === "production")) {
    const secret = requireValue(env, "JOB_RUNNER_SECRET", errors);
    if (secret && secret.length < 32)
      errors.push("JOB_RUNNER_SECRET must be at least 32 characters");
  }
  if (deploymentProfile === "zero-cost") {
    if (jobRunnerMode !== "endpoint") {
      errors.push("JOB_RUNNER_MODE must be endpoint for the zero-cost deployment profile");
    }
    if (env.STORAGE_DRIVER !== "supabase") {
      errors.push("STORAGE_DRIVER must be supabase for the zero-cost deployment profile");
    }
    if (env.DATABASE_SSL !== "true") {
      errors.push("DATABASE_SSL must be true for the zero-cost deployment profile");
    }
  }

  const trustedOrigins = (env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  trustedOrigins.forEach((origin, index) =>
    validateOrigin(
      origin,
      `TRUSTED_ORIGINS entry ${index + 1}`,
      errors,
      environment === "production",
    ),
  );
  if (env.PUBLIC_APP_URL?.trim()) {
    validateOrigin(
      env.PUBLIC_APP_URL.trim(),
      "PUBLIC_APP_URL",
      errors,
      environment === "production",
    );
  }

  const sheetsDriver = env.GOOGLE_SHEETS_DRIVER ?? "memory";
  if (sheetsDriver !== "memory" && sheetsDriver !== "google") {
    errors.push("GOOGLE_SHEETS_DRIVER must be memory or google");
  }
  if (environment === "production" || sheetsDriver === "google") {
    for (const name of [
      "GOOGLE_SHEETS_SPREADSHEET_ID",
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    ]) {
      requireValue(env, name, errors);
    }
  }

  const emailDriver = env.EMAIL_DRIVER ?? "memory";
  if (emailDriver !== "memory" && emailDriver !== "resend") {
    errors.push("EMAIL_DRIVER must be memory or resend");
  }
  if (environment === "production" && emailDriver !== "resend") {
    errors.push("EMAIL_DRIVER must be resend in production");
  }
  if (emailDriver === "resend") {
    requireValue(env, "RESEND_API_KEY", errors);
    requireValue(env, "RESEND_FROM_EMAIL", errors);
  }

  const storageDriver = env.STORAGE_DRIVER ?? "memory";
  if (!["memory", "r2", "supabase"].includes(storageDriver)) {
    errors.push("STORAGE_DRIVER must be memory, r2, or supabase");
  }
  if (storageDriver === "supabase") {
    const supabaseUrl = requireValue(env, "SUPABASE_URL", errors);
    if (supabaseUrl) validateOrigin(supabaseUrl, "SUPABASE_URL", errors, true);
    requireValue(env, "SUPABASE_SERVICE_ROLE_KEY", errors);
    requireValue(env, "SUPABASE_STORAGE_BUCKET", errors);
  }

  for (const name of ["SESSION_COOKIE_NAME", "ATTENDANCE_DEVICE_COOKIE_NAME"]) {
    const value =
      env[name] ?? (name === "SESSION_COOKIE_NAME" ? "ksa_session" : "ksa_attendance_device");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(value))
      errors.push(`${name} contains invalid cookie-name characters`);
  }

  if (environment === "production") {
    if (env.DATABASE_SSL !== "true") errors.push("DATABASE_SSL must be true in production");
    if (env.COOKIE_SECURE !== "true") errors.push("COOKIE_SECURE must be true in production");
    if (!env.TRUSTED_ORIGINS?.trim()) errors.push("TRUSTED_ORIGINS is required in production");
    if (!env.PUBLIC_APP_URL?.trim()) errors.push("PUBLIC_APP_URL is required in production");
    if (env.PUBLIC_APP_URL?.trim() && trustedOrigins.length > 0) {
      try {
        if (
          !trustedOrigins.some(
            (origin) => new URL(origin).origin === new URL(env.PUBLIC_APP_URL as string).origin,
          )
        ) {
          errors.push("PUBLIC_APP_URL origin must be listed in TRUSTED_ORIGINS");
        }
      } catch {
        // URL format errors are reported by validateOrigin above.
      }
    }
    if (env.API_DOCS_ENABLED === "true")
      errors.push("API_DOCS_ENABLED must be false in production");
    if (env.GOOGLE_SHEETS_DRIVER !== "google")
      errors.push("GOOGLE_SHEETS_DRIVER must be google in production");
    if (!env.SENTRY_DSN?.trim()) errors.push("SENTRY_DSN is required in production");
    if (storageDriver === "memory") {
      errors.push("STORAGE_DRIVER must be supabase or r2 in production");
    }
    if (storageDriver === "r2") {
      for (const name of [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "R2_ENDPOINT",
      ]) {
        requireValue(env, name, errors);
      }
    }
    requireValue(env, "AUTH_TOKEN_ENCRYPTION_KEY", errors);
    if (
      env.AUTH_TOKEN_ENCRYPTION_KEY &&
      !/^(?:[0-9a-fA-F]{64}|[A-Za-z0-9_-]{43})$/.test(env.AUTH_TOKEN_ENCRYPTION_KEY)
    ) {
      errors.push("AUTH_TOKEN_ENCRYPTION_KEY must be a 32-byte hex or base64url value");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.join("; ")}`);
  }

  return env;
}
