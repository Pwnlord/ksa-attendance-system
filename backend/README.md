# KSA Attendance Backend

NestJS + TypeScript foundation for the authoritative KSA Attendance API.

Phase 6 adds asynchronous Google Sheets projection, Master Register/session/Summary reporting, denominator and late-registration rules, retry/backlog health, Admin retry/reconciliation endpoints, and a credential-swappable Google provider. Phase 8 adds stricter production configuration checks, security headers/origin verification, and durable Resend email delivery through the PostgreSQL worker. Production credentials remain deployment configuration.

## Local setup

Requirements:

- Node.js 20 or newer
- PostgreSQL 15 or newer

```sh
cp .env.example .env
npm install
npm run db:migrate
npm run start:dev
```

The API listens on `http://localhost:3001` by default. Health endpoints are available at:

- `GET /api/v1/health/live` — process liveness, no database query.
- `GET /api/v1/health/ready` — API readiness including PostgreSQL connectivity.
- `/api/docs` — generated Swagger/OpenAPI documentation for implemented foundation endpoints.
- In production, API docs are disabled by default and must not be publicly exposed.

For automatic session activation/closure, run the compiled lifecycle worker in a separate process:

```sh
npm run jobs:work
```

## Checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Database workflow

Drizzle schema definitions live in `src/database/schema.ts`. Reviewed migrations live in `drizzle/` and are applied with `npm run db:migrate`. Do not edit a migration that has been applied to a shared environment; create a new migration for changes.

The migrations create the domain skeleton and the constraints needed by the implemented and later slices, including unique participant identity fields, one active device per participant, one open session per course, one attendance record per participant/session, one pending manual case per participant/session, versioned roster/photo-review records, hashed account tokens, rate-limit buckets, and idempotent background-job source keys.

## One-time Administrator bootstrap

Public registration will never create an Administrator. Bootstrap the first Administrator from a controlled deployment environment, piping the password through standard input rather than putting it in shell history:

```sh
printf '%s' 'use-a-secret-password-here' | npm run bootstrap:admin -- --email admin@example.com --confirm BOOTSTRAP_ADMIN
```

The command takes an advisory database lock, refuses to run when an active Administrator already exists, creates the account and role in one transaction, and writes a sanitized audit event. Use a secret manager or protected deployment console instead of the example command for real operations.

## Runtime boundaries

- Login sessions and attendance-device credentials are separate hashed server-side records and cookies.
- Cookies are Secure/HttpOnly/host-only/SameSite=Lax according to environment configuration.
- Background jobs use PostgreSQL; Redis is not part of the MVP.
- Production private files use Cloudflare R2. Memory storage is only a local foundation adapter.
- Registration and photo replacement uploads are decoded and re-encoded as private JPEGs at a maximum 1600 px longest edge, quality 85, with EXIF removed.
- Email verification and password-recovery delivery data is encrypted before it is placed in the PostgreSQL-backed job queue; only verified email accounts receive recovery jobs.
- The worker processes verification and password-recovery jobs through the configured memory provider locally or Resend in production. Provider failures remain retryable job failures and never change committed attendance.
- The worker processes due superseded-photo retention jobs by deleting the private object before marking the database row deleted, then records a system audit event. Storage failures leave the row eligible for retry.
- API and worker failures are sent to Sentry only through sanitized generic errors; replay and participant-sensitive request data are not sent.
- Public registration can grant only `PARTICIPANT`; Administrator role changes preserve audit context and protect the final Administrator.
- Exact participant coordinates are not represented in the database schema.
- Automatic attendance stores only rounded distance, reported accuracy, and the evaluation outcome; raw coordinates are discarded.
- Successful attendance commits a database record before queueing the asynchronous Sheets projection job.
- Google Sheets runs through the PostgreSQL-backed worker. Local development uses the memory provider; production uses a least-privilege Google service account configured through environment secrets.
- Errors return a stable safe envelope with a correlation ID; stack traces and sensitive request data are never returned.
