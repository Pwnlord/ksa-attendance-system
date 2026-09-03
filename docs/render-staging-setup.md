# Render Staging Setup Runbook

This runbook is for the first controlled staging deployment of the KSA Attendance System. It is staging-only. Do not use production credentials, production photos, or normal participant data during this setup.

## What must exist first

### Private source repository

The project must be pushed to a private GitHub or other supported Git provider repository. The repository root must contain:

```text
render.yaml
backend/
frontend/
mockup/
docs/
context/
```

Before pushing, confirm that `backend/.env` and other local secret files are excluded. Never commit API keys, database passwords, Google private keys, R2 secrets, or participant data.

### Render account

Create or use the Render workspace that will own the staging resources. The person who owns this workspace should also be identified as the deployment and rollback contact.

## Create the staging Blueprint

The repository already contains a staging-only [`render.yaml`](../render.yaml). In the Render Dashboard:

1. Select **New → Blueprint**.
2. Connect the private repository.
3. Select the branch to deploy.
4. Select the root `render.yaml` if Render does not detect it automatically.
5. Review the proposed resource names and plans.
6. Do not create production resources during this step.
7. Deploy the Blueprint only after confirming that all staging secret values are ready.

The Blueprint creates these resources:

| Resource | Render type | Purpose | Staging plan |
| --- | --- | --- | --- |
| `ksa-attendance-staging-frontend` | Web service | Next.js participant/operator interface | Free for initial smoke deployment; paid is preferred for serious rehearsal |
| `ksa-attendance-staging-api` | Web service | NestJS authoritative API | Minimum paid plan; required for pre-deploy migrations and private-network access |
| `ksa-attendance-staging-worker` | Background worker | PostgreSQL queue, email, Sheets, lifecycle, and photo-retention jobs | Minimum paid worker plan |
| `ksa-attendance-staging-db` | Render Postgres | Authoritative staging database | Paid minimum plan so backup/restore can be tested |

The API requires a paid service plan because its Blueprint uses a pre-deploy migration command and the frontend reaches it over Render’s private network. The worker cannot use a Free service plan, and Free Postgres does not provide automatic backups. Render’s current plan limitations should be checked before confirming billing. [Render compute plans](https://render.com/docs/compute-plans), [Render Free limitations](https://render.com/docs/free)

## Configure the services

### Values wired automatically by the Blueprint

Render supplies these references:

- `DATABASE_URL` on the API and worker from the staging Postgres database.
- `BACKEND_INTERNAL_URL` on the frontend from the API’s private `host:port` address.

The frontend rewrite converts that private address into an internal HTTP URL. The browser still calls only the frontend’s `/api/v1` path.

The frontend may remain on the Free plan for the initial smoke deployment. It can be upgraded later for a more reliable rehearsal without changing the application architecture.

### Fixed values already in the Blueprint

The Blueprint sets:

```text
NODE_ENV=staging
COOKIE_SECURE=true
API_DOCS_ENABLED=false
STORAGE_DRIVER=r2
EMAIL_DRIVER=resend
GOOGLE_SHEETS_DRIVER=google
R2_PRESIGNED_URL_TTL_SECONDS=300
```

### Values to enter in Render

Enter these values through the Render Dashboard or the Blueprint’s initial secret prompts. Never put the values in `render.yaml` or this document.

For the API:

| Variable | What to provide |
| --- | --- |
| `PUBLIC_APP_URL` | The HTTPS URL of the staging frontend |
| `TRUSTED_ORIGINS` | The same staging frontend origin, without a path |
| `AUTH_TOKEN_ENCRYPTION_KEY` | A new 32-byte staging key; use a 64-character hexadecimal value |
| `R2_ACCOUNT_ID` | Staging Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Staging R2 access key with only the required bucket access |
| `R2_SECRET_ACCESS_KEY` | Matching staging R2 secret |
| `R2_BUCKET` | Private staging photo bucket |
| `R2_ENDPOINT` | Staging R2 endpoint |
| `RESEND_API_KEY` | Staging/test Resend API key |
| `RESEND_FROM_EMAIL` | Approved staging sender address |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Staging test workbook ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Staging least-privilege service account |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Staging service-account private key |
| `SENTRY_DSN` | Staging Sentry DSN |

For the worker, enter the same staging storage, email, Google, encryption, and Sentry values. `TRUSTED_ORIGINS` is not needed by the worker. `PUBLIC_APP_URL` is still required so queued verification and password-reset links point to staging.

For `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, preserve the key content. If Render requires a single-line value, use the escaped newline form expected by the application (`\\n`).

Generate a staging encryption key locally if needed:

```sh
openssl rand -hex 32
```

Do not send the generated key or any other secret through chat, screenshots, source control, or issue comments.

## External services required for staging

These services are configured outside Render, but their staging values are entered into Render:

- **Cloudflare R2:** create a separate private staging bucket and restricted access key.
- **Resend:** use a test sender/domain and controlled recipients; do not send staging mail to the whole participant list.
- **Google Sheets:** create a separate test workbook and share it only with the staging service account.
- **Sentry:** create a staging project or environment with session replay disabled and sensitive-field filtering enabled.

Do not use Supabase Auth, Supabase Storage, or Supabase Realtime for this staging setup. The approved design uses server-managed sessions, private R2 photos, and polling. Supabase remains an optional alternative PostgreSQL provider, not part of the current Render Blueprint.

## Deployment order and checks

After the Blueprint is deployed:

1. Confirm the staging database exists and migrations complete.
2. Confirm the API health check passes:

   ```text
   https://<staging-api>/api/v1/health/live
   https://<staging-api>/api/v1/health/ready
   ```

3. Confirm the frontend opens at `/login`.
4. Confirm the frontend `/api/v1` requests reach the API without exposing the API service to the browser as a separate authentication origin.
5. Confirm the worker starts and remains running.
6. Confirm the Render logs contain no secrets, tokens, private photo URLs, exact coordinates, or participant-sensitive request bodies.
7. Confirm the staging R2 bucket cannot be accessed publicly.
8. Confirm test email delivery and staging-origin links.
9. Confirm the test Google workbook receives only staging projection data.
10. Confirm Sentry receives only sanitized generic errors and has no session replay.

Render web services can use HTTP health-check paths such as the API readiness endpoint. [Render health checks](https://render.com/docs/health-checks)

## Staging acceptance pass

Use fictional roster entries and test accounts to verify:

- Registration, email verification, login, logout, and password recovery.
- The permanent QR check-in route and return-to-login behavior.
- Automatic attendance, duplicate handling, device recognition, and location outcomes.
- Manual verification, device replacement, session extension, cancellation, and Administrator correction.
- Private photo review, replacement approval, and retention-job retry behavior.
- Google Sheets outage, retry, and reconciliation behavior.
- Rate limits, authorization denials, safe errors, and correlation IDs.
- Android Chrome, iPhone Safari, and an operator desktop browser.
- Keyboard access, focus visibility, labels, status messages, zoom, contrast, reduced motion, and touch targets.
- Database backup/restore evidence and worker restart recovery.

Record the result, date, environment, browser/device, expected outcome, actual outcome, defect, owner, and follow-up action in the Phase 9 evidence record.

## Safety boundaries

- This is not production deployment.
- Do not point the wall QR at staging for normal attendance.
- Do not import the real approved roster until the pilot process explicitly permits it.
- Do not use production R2, Resend, Google, Sentry, or database credentials.
- Do not add a custom production domain yet.
- Do not enable photo retention for production until an explicit course-end date/time is modeled and verified.

## Gate 1 completion

Staging is ready for the controlled pilot only after deployment, security, acceptance, accessibility, device, worker, provider, backup, and support checks are recorded and approved. The next gate is the controlled venue pilot; production remains a separate later gate.
