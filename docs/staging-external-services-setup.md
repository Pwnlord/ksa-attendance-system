# Staging External Services Setup

This is the single setup checklist for the zero-cost staging deployment. It collects the external
accounts, projects, credentials, and release actions that are still outside this repository.

## Current answer: what is still stopping staging?

The application and zero-cost deployment files are implemented and have passed the local checks.
Staging is not fully ready until the following external work is completed:

1. Push the `staging` branch to a private repository and make sure GitHub Actions can run.
2. Create the separate Supabase Free staging project, database connection, and private photo bucket.
3. Create the two Free Render web services from the root Blueprint and enter the environment values.
4. Configure a staging email sender in Resend.
5. Configure a staging Google service account and test Spreadsheet.
6. Optionally connect a Sentry free project for staging observability; it is required by the
   production configuration checks.
7. Run the reviewed database migrations and bootstrap the first staging Administrator from a
   controlled machine.
8. Run the staging acceptance and security checks, including the scheduled-job and provider-failure
   checks.

So the remaining work is mostly external setup, but it is not only clicking through Render and
Supabase. The migration, Administrator bootstrap, configuration verification, and end-to-end
acceptance pass are still required release actions.

## Zero-cost target

The active architecture uses only free-tier resources:

```text
Browser
  |
  v
Render Free frontend  --public HTTPS proxy-->  Render Free API
                                                |
                                                +--> Supabase Free PostgreSQL
                                                +--> Supabase Free private Storage
                                                +--> Resend staging email
                                                +--> Google Sheets staging workbook

GitHub Actions free schedule --protected request--> API job endpoint
Administrator ----------------protected manual run-> API job endpoint
```

Do not create or approve a Render Postgres database, a Render background worker, a paid Render
service, or any required payment method for this staging plan. The detailed service topology is in
[`render-staging-setup.md`](render-staging-setup.md), and the reversible paid/free comparison is in
[`zero-cost-architecture-migration.md`](zero-cost-architecture-migration.md).

## External dependency checklist

| Dependency | Status for staging | What it supplies |
| --- | --- | --- |
| Private GitHub repository | Required | Source code, branch, and the scheduled job workflow |
| GitHub Actions | Required for automatic jobs; manual fallback exists | Calls the protected one-shot job endpoint |
| Supabase Free project | Required | PostgreSQL database and private photo Storage |
| Render account/workspace | Required | Free frontend and API web services |
| Resend account | Required by the active staging Blueprint | Verification and password-recovery email |
| Google Cloud/service account + Sheets | Required by the active staging Blueprint | Reporting projection workbook |
| Sentry project | Recommended for staging; required before production | Sanitized error tracking |
| Custom domain/DNS | Not required for initial staging | Render-provided HTTPS URLs are sufficient |
| Real roster, participant data, and production credentials | Prohibited in staging | None; use fictional test data |

## Before starting

- Use separate staging resources and secrets. Never reuse production credentials.
- Keep all keys in a password manager and deployment secret settings, not in Git, this document,
  screenshots, browser code, or chat.
- Use fictional participants, emails, photos, and attendance records.
- Keep the Supabase Storage bucket private.
- Do not enable Supabase Auth, Realtime, or direct frontend access to the database. The NestJS API
  remains responsible for sessions, cookies, authorization, and attendance decisions.
- If any dashboard asks for a paid plan or required payment method, stop before accepting it. This
  plan has no paid-service dependency.

## 1. Prepare the private GitHub repository

The repository should contain at least:

```text
render.yaml
backend/
frontend/
mockup/
docs/
context/
.github/workflows/zero-cost-jobs.yml
```

### Setup

1. Create or use a private GitHub repository.
2. Push the `staging` branch to it.
3. Confirm `.gitignore` excludes `backend/.env`, `frontend/.env*` except examples, private keys,
   local database files, and build output.
4. Confirm the workflow file exists at `.github/workflows/zero-cost-jobs.yml`.
5. In **Settings → Actions → General**, allow Actions for the repository if they are disabled.

The workflow runs every five minutes and also supports **Run workflow**. GitHub scheduled
workflows run from the latest commit on the repository's default branch. Therefore, for automatic
staging runs, either make `staging` the default branch or merge the workflow into the current
default branch. Until then, the workflow can be run manually. See the [GitHub scheduled workflow
documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule).

Do not add the job secrets yet if the API URL does not exist. They are added after Render creates
the API service.

## 2. Create the Supabase Free staging project

Supabase supplies both the database and private photo storage in this architecture.

### Create the project

1. Sign in to Supabase and create a new project named `ksa-attendance-staging`.
2. Select the Free plan and a region reasonably close to the Render Frankfurt region, if available.
3. Generate a strong database password and store it safely.
4. Wait for the project to finish provisioning.
5. Keep the project reference, project URL, and database connection information available.

Use a separate production project later. Do not put pilot or production data in this staging
project unless the release gate explicitly approves it.

### Get the database connection

In the Supabase **Connect** screen, copy the **Shared Pooler — Session mode** PostgreSQL connection
string. This becomes the API's `DATABASE_URL`.

Configure the API with:

```text
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
DATABASE_POOL_MAX=5
```

The second setting is allowed for the current pooler setup only when certificate verification cannot
be used by the connection. If the deployed connection verifies its certificate successfully, use
`DATABASE_SSL_REJECT_UNAUTHORIZED=true`.

References: [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
and [Supabase pricing](https://supabase.com/pricing).

### Create private photo storage

1. Open **Storage** in the Supabase project.
2. Create a bucket named `attendance-photos-staging`.
3. Mark the bucket **Private**. Do not use a public bucket.
4. Do not upload real identification photos.
5. From **Project Settings → API**, copy the project URL and the backend-only `service_role` key.

The service-role key must exist only in the Render API environment and controlled migration/runtime
environments. It must never be a `NEXT_PUBLIC_*` variable or sent to a browser. The backend creates
short-lived signed URLs only after authorization.

Reference: [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

### Supabase values needed later

```text
DATABASE_URL=<Shared Pooler Session mode connection string>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<backend-only service-role key>
SUPABASE_STORAGE_BUCKET=attendance-photos-staging
```

Maintain a protected manual database export before important staging or pilot changes. Free-tier
pausing, storage, database, and backup limitations must be included in the acceptance evidence.
Reference: [Supabase backups](https://supabase.com/docs/guides/platform/backups).

## 3. Create the free Render services

The root [`render.yaml`](../render.yaml) is already the zero-cost Blueprint.

### Create from the Blueprint

1. Open Render and choose **New → Blueprint**.
2. Connect the private GitHub repository.
3. Select the `staging` branch.
4. Select the root `render.yaml` if it is not detected automatically.
5. Before applying, verify that the review contains exactly these two resources:

   | Service | Type | Plan |
   | --- | --- | --- |
   | `ksa-attendance-staging-api` | Web service | Free |
   | `ksa-attendance-staging-frontend` | Web service | Free |

6. Verify that no database, worker, pre-deploy command, paid plan, or required payment method is
   present.
7. Apply the Blueprint.

Render's Free web services can sleep after inactivity, so the first request after idle time can be
slow. This is an accepted staging limitation that must be tested. See [Render Free service
limitations](https://render.com/docs/free) and the [Render Blueprint specification](https://render.com/docs/blueprint-spec).

### API environment values

The Blueprint provides the fixed values. Enter the following as Render API environment values or
secrets:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase staging pooler connection string |
| `TRUSTED_ORIGINS` | Exact frontend HTTPS origin, with no path |
| `PUBLIC_APP_URL` | Exact frontend HTTPS URL |
| `AUTH_TOKEN_ENCRYPTION_KEY` | New random 32-byte staging key |
| `JOB_RUNNER_SECRET` | New random secret, at least 32 characters |
| `SUPABASE_URL` | Supabase staging project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase backend-only service-role key |
| `SUPABASE_STORAGE_BUCKET` | `attendance-photos-staging` |
| `RESEND_API_KEY` | Staging Resend API key |
| `RESEND_FROM_EMAIL` | Verified staging sender address |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Staging workbook ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Staging service-account email |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Staging service-account private key |
| `SENTRY_DSN` | Staging Sentry DSN, if created |

The Blueprint already fixes these values:

```text
NODE_ENV=staging
DEPLOYMENT_PROFILE=zero-cost
DATABASE_SSL=true
DATABASE_POOL_MAX=5
COOKIE_SECURE=true
API_DOCS_ENABLED=false
JOB_RUNNER_MODE=endpoint
STORAGE_DRIVER=supabase
EMAIL_DRIVER=resend
GOOGLE_SHEETS_DRIVER=google
```

After Render displays the actual frontend URL, set `TRUSTED_ORIGINS` and `PUBLIC_APP_URL` to that
exact origin and redeploy the API if necessary. After Render displays the actual API URL, set the
frontend value:

```text
BACKEND_PUBLIC_URL=https://<staging-api-public-host>
```

The browser uses the frontend's `/api/v1` path; the frontend server proxies it to the API. This
keeps the browser flow simple, but the API is still publicly reachable in this free topology and
must retain its CSRF, cookie, rate-limit, authentication, authorization, and safe-error controls.

## 4. Configure Resend for staging email

Resend sends email-verification and password-recovery messages through the existing job system.

### Setup

1. Create or sign in to a Resend account.
2. Add and verify a domain, or use an account-approved test sender as permitted by Resend.
3. Create a staging API key.
4. Set a sender such as `KSA Staging <staging@your-verified-domain.example>`.
5. Use only controlled test recipient addresses during staging.
6. Add the key and sender to Render as `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

Keep staging email clearly labeled. Do not send real participant communications from the staging
environment. Rotate or revoke the staging key if it is exposed.

References: [Resend API keys](https://resend.com/docs/dashboard/api-keys) and [Resend domain
setup](https://resend.com/docs/dashboard/domains/introduction).

## 5. Configure Google Sheets for staging

Google Sheets is a reporting projection only. PostgreSQL remains the attendance source of truth.

### Setup

1. Create or select a Google Cloud project for staging.
2. Enable the Google Sheets API for that project.
3. Create a service account.
4. Create a service-account key and download it once. Store it securely; do not commit the JSON
   file.
5. Create a blank staging Spreadsheet, for example `KSA Attendance — Staging`.
6. Share that Spreadsheet with the service-account email as **Editor**.
7. Copy the Spreadsheet ID from its URL.
8. Add these values to the Render API service:

   ```text
   GOOGLE_SHEETS_SPREADSHEET_ID=<staging spreadsheet id>
   GOOGLE_SERVICE_ACCOUNT_EMAIL=<service account email>
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<private key, preserving newline escapes>
   ```

The Spreadsheet may temporarily be owned by a personal Google account for staging if that is the
chosen setup. For a real Kora handoff, transfer ownership or replace the service-account/workbook
values with Kora's organization-controlled credentials. Sharing the workbook with the service
account is still required in either case.

References: [Create service accounts](https://cloud.google.com/iam/docs/service-accounts-create),
[Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com), and
[share Google files](https://support.google.com/docs/answer/2494822).

## 6. Configure Sentry (recommended staging setup)

Sentry is optional for staging under the current validator, but it is recommended so errors during
the pilot are diagnosable. The production validator requires `SENTRY_DSN`.

1. Create a Sentry project for the Node/NestJS API.
2. Copy its DSN.
3. Add it to the Render API service as `SENTRY_DSN`.
4. Confirm replay is not enabled and sensitive fields are filtered.
5. Confirm events contain no participant photos, exact coordinates, passwords, tokens, or private
   request payloads.

Use a separate Sentry project or DSN for production later. The application already sends sanitized
errors rather than raw sensitive request data.

Reference: [Sentry's Node setup](https://docs.sentry.io/platforms/javascript/guides/node/install/).

## 7. Add the GitHub Actions job secrets

Do this after the Render API URL is available.

In the repository, open **Settings → Secrets and variables → Actions → New repository secret** and
add:

| Secret | Value |
| --- | --- |
| `JOB_RUNNER_URL` | `https://<staging-api-public-host>/api/v1/internal/jobs/run` |
| `JOB_RUNNER_SECRET` | Exactly the same value as the Render API's `JOB_RUNNER_SECRET` |

The API endpoint accepts only the secret header and processes a bounded batch. It does not return
job payloads. Never print the secret in workflow output.

## 8. Run migrations and bootstrap the staging Administrator

Render Free does not run the old pre-deploy migration command. From a controlled machine, with the
backend dependencies installed and a temporary/local ignored environment containing the Supabase
staging values:

```sh
cd backend
npm ci
npm run db:migrate
```

Then use the secure bootstrap command documented in [`backend/README.md`](../backend/README.md) to
create the first staging Administrator. Do not create the first Administrator through public
registration. Record the migration commit and time, but never record passwords or keys.

## 9. Verify staging in this order

- [ ] Render shows exactly two Free web services and no paid resource, database, or worker.
- [ ] Supabase staging database accepts the API's TLS connection.
- [ ] Migrations completed successfully.
- [ ] A staging Administrator was bootstrapped.
- [ ] API liveness works: `https://<staging-api>/api/v1/health/live`.
- [ ] API readiness works: `https://<staging-api>/api/v1/health/ready`.
- [ ] Frontend `/login` loads and its `/api/v1` requests reach the API.
- [ ] Registration, verification, login, recovery, QR check-in, and role permissions work with
      fictional data.
- [ ] Supabase photo bucket is private; authorized review returns only a short-lived signed URL.
- [ ] Resend delivers only controlled staging messages.
- [ ] Sheets receives staging projections and an outage/retry is observed.
- [ ] GitHub Actions manual dispatch succeeds; automatic schedule is confirmed from the default
      branch or intentionally left manual.
- [ ] A wrong job-runner secret is rejected.
- [ ] Administrator manual **Run due jobs** works as a fallback.
- [ ] Free-service sleep/wake, Supabase pause risk, rate limits, provider failures, and safe errors
      are recorded.
- [ ] A protected Supabase export and non-production restore procedure are tested.

Use [`phase-9-release-plan.md`](phase-9-release-plan.md) and [`acceptance-tests.md`](acceptance-tests.md)
for the full staging gate.

## Not required for this staging deployment

Do not set up these items for the active zero-cost profile:

- Render Postgres.
- A Render background worker.
- Cloudflare R2.
- Supabase Auth or Realtime.
- A custom domain or DNS change.
- Production credentials, real participant data, real identification photos, or the permanent
  venue QR.

## What changes for production later?

The same free topology can be reused. Create separate production resources and replace values for:

- a production Supabase project, private bucket, connection string, and service-role key;
- production Render service URLs and origins;
- a production Resend sender/API key;
- a Kora-controlled Google service account and workbook;
- a production Sentry DSN;
- new encryption and job-runner secrets; and
- production GitHub Actions secrets.

Changing environment variables is enough when compute changes but Supabase remains the database and
photo provider. Moving data to another database or photo provider is a separate migration: export,
restore/copy, verify, switch traffic, and keep the old source for rollback. See
[`zero-cost-architecture-migration.md`](zero-cost-architecture-migration.md).
