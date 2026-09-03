# Zero-Cost Render and Supabase Staging Runbook

This runbook is for the first staging deployment of the KSA Attendance System. The hard
constraint is that staging, the controlled pilot, and the intended production deployment use no
paid services. Do not approve a Blueprint review that contains a paid Render resource, Render
Postgres, a Render background worker, a required payment method, or a paid plan.

The architecture comparison and reversal procedure are in
[`zero-cost-architecture-migration.md`](zero-cost-architecture-migration.md).

## What must exist first

### Private source repository

The project must be pushed to a private GitHub or other supported Git provider repository. The
repository root must contain:

```text
render.yaml
backend/
frontend/
mockup/
docs/
context/
.github/workflows/zero-cost-jobs.yml
```

Before pushing, confirm that `backend/.env` and other local secret files are excluded. Never commit
API keys, database passwords, Supabase service-role keys, Google private keys, participant data, or
photos.

### Supabase Free project

Create a separate project named something like `ksa-attendance-staging` on the Free plan.

Prepare these items in Supabase:

- A strong database password stored in a password manager.
- The **Shared Pooler — Session mode** PostgreSQL connection string from the Connect screen.
- A private Storage bucket named something like `attendance-photos-staging`.
- The project URL and backend-only service-role key.

Do not enable Supabase Auth, Realtime, or public photo access. The NestJS backend owns sessions and
authorization. Do not import the real roster or upload real participant photos during staging.

Supabase Free has database, storage, pausing, and backup limitations. Maintain manual protected
database exports before important staging/pilot changes. [Supabase pricing](https://supabase.com/pricing),
[Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[Supabase backups](https://supabase.com/docs/guides/platform/backups)

## Create the zero-cost Render Blueprint

The root [`render.yaml`](../render.yaml) is the active zero-cost Blueprint. In the Render Dashboard:

1. Select **New → Blueprint**.
2. Connect the private repository.
3. Select the `staging` branch.
4. Select the root `render.yaml` if Render does not detect it automatically.
5. Review the proposed resources and confirm that every service says **Free**.
6. Confirm that no database or worker resource appears.
7. Deploy only after the external values below are ready.

The Blueprint creates exactly:

| Resource | Render type | Plan | Purpose |
| --- | --- | --- | --- |
| `ksa-attendance-staging-api` | Web service | Free | NestJS API and protected one-shot job endpoint |
| `ksa-attendance-staging-frontend` | Web service | Free | Next.js application and `/api/*` server proxy |

The Blueprint deliberately does not create Render Postgres, a background worker, a pre-deploy
migration command, or any paid resource.

## Configure Render environment values

### Fixed values in the Blueprint

```text
NODE_ENV=staging
DEPLOYMENT_PROFILE=zero-cost
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
DATABASE_POOL_MAX=5
COOKIE_SECURE=true
API_DOCS_ENABLED=false
JOB_RUNNER_MODE=endpoint
STORAGE_DRIVER=supabase
EMAIL_DRIVER=resend
GOOGLE_SHEETS_DRIVER=google
```

`DATABASE_SSL_REJECT_UNAUTHORIZED=false` still requires encrypted database traffic; use it only if
the Supabase pooler certificate setup requires it. If the deployed connection can verify the
certificate, set it to `true`.

### API values entered as secrets

| Variable | What to provide |
| --- | --- |
| `DATABASE_URL` | Supabase staging pooler connection string |
| `TRUSTED_ORIGINS` | The frontend HTTPS origin, without a path |
| `PUBLIC_APP_URL` | The frontend HTTPS URL |
| `AUTH_TOKEN_ENCRYPTION_KEY` | New 32-byte staging key, for example `openssl rand -hex 32` |
| `JOB_RUNNER_SECRET` | New random secret of at least 32 characters |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase backend-only service-role key |
| `SUPABASE_STORAGE_BUCKET` | Private staging bucket name |
| `RESEND_API_KEY` | Staging/test Resend key |
| `RESEND_FROM_EMAIL` | Approved staging sender |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Staging workbook ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Least-privilege staging service account |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Staging service-account private key |
| `SENTRY_DSN` | Staging Sentry DSN, if using the free allowance |

Never paste any secret into this document, chat, screenshots, source control, or logs. Preserve
escaped newlines if Render requires the Google private key to be one line.

### Frontend value entered as a secret

After the API service is created, copy its public HTTPS URL into the frontend service as:

```text
BACKEND_PUBLIC_URL=https://<staging-api-public-host>
```

The browser still calls the frontend's `/api/v1` path. Next.js proxies that path server-side to the
API URL. The API is publicly reachable in this Free topology, so its origin, CSRF, cookie, rate
limit, authentication, and authorization controls remain mandatory.

## Configure the free scheduled job runner

The repository includes `.github/workflows/zero-cost-jobs.yml`. It calls the protected API endpoint
every few minutes and can also be started manually from the GitHub Actions tab.

Important for the current `staging` branch: GitHub scheduled workflows run from the latest commit
on the repository's default branch. Before relying on automatic runs, put this workflow on the
default branch or make `staging` the default branch. Otherwise use **Run workflow** manually until
that is done. [GitHub scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)

Add these GitHub repository secrets:

| Secret | Value |
| --- | --- |
| `JOB_RUNNER_URL` | `https://<staging-api-public-host>/api/v1/internal/jobs/run` |
| `JOB_RUNNER_SECRET` | The exact same value as the Render API secret |

The endpoint processes a bounded batch of due email, Sheets, lifecycle, manual-case, and photo-
retention jobs. It returns no job payloads. An Administrator can also call the protected **Run due
jobs** operation from the application when the scheduled workflow is delayed.

Free scheduling is eventually consistent: it does not guarantee exact-second session transitions
or immediate email/Sheets delivery. Request-time session/case reconciliation and the manual Admin
fallback remain in place.

## Run migrations explicitly

Render Free does not run the old pre-deploy migration command. From a controlled machine with the
backend dependencies installed, set the Supabase connection values in the local environment and
run:

```sh
cd backend
npm ci
npm run db:migrate
```

Verify the command reports `Database migrations applied.` before testing the deployed API. Do not
put the connection string in a shell history that others can access.

Bootstrap the first staging Administrator through the existing secure CLI procedure after the
migration. Do not use public registration to create the first Administrator.

## Deployment checks

1. Confirm the Blueprint review lists exactly two Free web services.
2. Confirm no Render Postgres, worker, paid plan, pre-deploy command, or required payment method is present.
3. Run the explicit database migration and record its time/commit.
4. Confirm API health:

   ```text
   https://<staging-api>/api/v1/health/live
   https://<staging-api>/api/v1/health/ready
   ```

5. Open the frontend at `/login` and verify its `/api/v1` requests reach the API.
6. Manually dispatch the GitHub job workflow and confirm a valid response without secrets in logs.
7. Verify a bad job-runner secret is rejected and does not process jobs.
8. Verify Supabase Storage is private and authorized photo review returns only a short-lived signed URL.
9. Verify the test workbook, Resend sender, and Sentry project contain staging-only data.
10. Test a sleeping-service wake-up, database outage, provider outage, queue retry, and Admin manual run.

Render Free web services may sleep after inactivity. Supabase Free projects may pause after low
activity. These are known staging/pilot limitations and must be included in acceptance evidence.
[Render Free limitations](https://render.com/docs/free)

## Staging acceptance pass

Use fictional roster entries and test accounts to verify registration, email verification, login,
password recovery, device binding/replacement, the permanent QR check-in route, automatic/manual
attendance, session lifecycle, cancellation, correction, private photo access, Sheets outage and
reconciliation, rate limits, authorization, safe errors, mobile browsers, and accessibility.

Also record:

- migration and manual Supabase export evidence;
- scheduled job and manual fallback evidence;
- the delay observed for email and Sheets jobs;
- photo retention and failed-deletion retry evidence; and
- the Render/Supabase sleep or pause behavior.

## Safety boundaries

- This is not permission to use paid services.
- Do not point the permanent QR at staging for normal attendance.
- Do not import the real roster or create real participant accounts until the pilot gate explicitly permits it.
- Do not use production database, storage, email, Google, or Sentry credentials.
- Do not make the Supabase bucket public.
- Do not place the Supabase service-role key in frontend variables or browser code.

## Gate 1 completion

Staging is ready for the controlled pilot only after deployment, security, acceptance, accessibility,
device, export/restore, job-scheduler, provider-failure, and support checks are recorded and
approved. The next gate is the controlled venue pilot; production remains a separate later gate.
