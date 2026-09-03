# Zero-Cost Architecture and Reversal Guide

## Purpose

This document explains the architecture change required by the hard **no-paid-services**
constraint. It is separate from [`zero-cost-version-plan.md`](zero-cost-version-plan.md), which
describes the work to implement the free deployment. This document explains the before/after
architecture and how to move back later if the project owner deliberately chooses to pay for
managed resources.

The zero-cost architecture is the active target. The paid architecture is retained here as a
reversal path only; it must not be deployed while the no-paid-services decision is active.

## The two architectures at a glance

| Concern | Original paid topology | Zero-cost topology | What changes when switching |
| --- | --- | --- | --- |
| Frontend | Render Next.js web service | Render Free Next.js web service | Render plan only |
| API | Render NestJS web service on a paid plan | Render Free NestJS web service | Render plan and API URL wiring |
| Database | Render managed PostgreSQL | Supabase Free PostgreSQL | `DATABASE_URL` and TLS settings; data migration only if the database itself moves |
| Background work | Separate paid Render worker polling the PostgreSQL queue | No Render worker; a protected API endpoint processes a bounded batch, called by free GitHub Actions scheduling and manually when needed | `JOB_RUNNER_MODE` and deployment topology |
| Queue | PostgreSQL-backed durable queue | The same PostgreSQL-backed durable queue | No data-model change |
| Identification photos | Private Cloudflare R2 bucket | Supabase private Storage bucket | Storage driver and credentials; objects must be copied before switching provider |
| Email | Resend | Resend free allowance, if sufficient | Credentials/sender may change; application email interface stays the same |
| Google Sheets | Google service account | Google service account | Credentials/workbook may change; projection code stays the same |
| Error tracking | Sentry free or paid allowance | Sentry free allowance, if used | DSN may change; sanitization stays the same |
| Database migrations | Render pre-deploy command | Run from a controlled machine or explicit release workflow | Migration execution location only |
| Frontend-to-API connection | Same public origin with private Render routing where available | Same public origin at the browser, with the frontend server proxying to the API's public HTTPS URL | `BACKEND_PUBLIC_URL` replaces private `host:port` wiring |

## What is actually being changed

The application is not being rebuilt as a different product. The authoritative attendance rules,
database schema, sessions, roles, device credentials, audit trail, API operations, and Google
Sheets projection remain the same.

The zero-cost implementation changes four infrastructure boundaries:

1. **Where PostgreSQL runs:** Render Postgres is removed from the Blueprint and Supabase supplies
   the PostgreSQL database.
2. **Where private photos live:** the storage interface gains a Supabase private-storage adapter;
   the rest of the photo authorization code continues to call the same interface.
3. **How queued work is started:** the existing queue and job handlers remain in the repository,
   but a Free Render web service does not host a permanently running separate worker. A protected
   one-shot runner processes due jobs in bounded batches.
4. **How migrations are launched:** the API service no longer depends on a Render pre-deploy
   command that is unavailable on the selected Free plan. Migrations are run explicitly from a
   controlled machine or a documented release workflow.

## What does not change

These remain identical in both profiles:

- The backend is the authority for attendance and authorization.
- PostgreSQL is the system of record; Google Sheets is only a reporting copy.
- The queue uses PostgreSQL and does not require Redis.
- Server-managed login sessions and separate attendance-device credentials remain in use.
- Identification photos are processed, stored privately, and exposed only through short-lived
  authorized URLs.
- Resend, Google Sheets, and Sentry are accessed only by backend secrets.
- The frontend continues to call `/api/v1` and does not make attendance decisions.
- The database migrations and application tables remain portable PostgreSQL structures.
- The standalone worker source and its `start:worker` command remain available for a later paid
  deployment.

## Configuration map

The following values select the zero-cost profile:

```text
DEPLOYMENT_PROFILE=zero-cost
DATABASE_URL=<Supabase PostgreSQL connection string>
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false   # only when required by the Supabase pooler setup
STORAGE_DRIVER=supabase
SUPABASE_URL=<Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<Supabase backend-only secret>
SUPABASE_STORAGE_BUCKET=<private bucket name>
JOB_RUNNER_MODE=endpoint
JOB_RUNNER_SECRET=<random backend-only secret>
```

The following values are provider/application values that normally change from staging to
production, but not because of the paid/free architecture choice:

```text
DATABASE_URL
PUBLIC_APP_URL
TRUSTED_ORIGINS
AUTH_TOKEN_ENCRYPTION_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
SENTRY_DSN
```

The frontend uses:

```text
BACKEND_PUBLIC_URL=https://<the-api-public-https-host>
```

The value is entered in the frontend deployment environment. It is not a browser-visible API
credential; it only tells the Next.js server where to proxy its `/api/*` requests.

## How the free job runner works

The database queue still receives email, Sheets, session-lifecycle, manual-case, and photo-
retention jobs. The zero-cost API exposes one protected internal operation that:

- authenticates with `JOB_RUNNER_SECRET`;
- claims only jobs that are due;
- processes a bounded batch;
- records success or schedules the existing retry behavior; and
- returns counts without exposing job payloads or secrets.

A free GitHub Actions scheduled workflow calls this endpoint periodically. An Administrator can
also run a bounded batch from the protected Admin operation when a manual recovery is needed.
GitHub scheduled workflows run from the latest commit on the repository's default branch, so the
workflow must be present on that branch (or the `staging` branch must be made the default) for
automatic staging runs. The workflow can still be started manually from the Actions tab when it
exists only on `staging`. [GitHub scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
This means the system is eventually processed rather than continuously processed: email and
Sheets work may wait for the next run, and exact-second lifecycle transitions cannot be promised
when no request or scheduled run is occurring.

The old standalone worker remains usable. It is not deleted, and no job payload migration is
required to use it later.

## Moving from zero-cost back to the paid topology

Changing only environment variables is sufficient when the existing Supabase database and
Supabase photo bucket remain in use and only compute is being upgraded. A full provider switch
requires a controlled data migration.

### Option A — pay for compute but keep Supabase

This is the smallest change:

1. Keep `DATABASE_URL` pointed at Supabase and keep `STORAGE_DRIVER=supabase`.
2. Change the API Render service from Free to the paid plan selected by Operations.
3. Add a separate paid Render background worker using `npm run start:worker`.
4. Set `JOB_RUNNER_MODE=worker` and remove the scheduled GitHub Actions call after the worker is
   confirmed healthy.
5. Keep the protected endpoint available but disabled by configuration; do not publish its secret
   unnecessarily.
6. Re-enable automated migration execution only after the paid deployment procedure has been
   reviewed.

No attendance, account, queue, or photo data needs to move in this option.

### Option B — return to the original provider layout

This switches the database and photos as well as compute:

1. Stop treating the free deployment as the writer during the cutover window.
2. Take and verify a Supabase database export. Keep it protected because it contains identity,
   attendance, and audit data.
3. Restore the export into the managed Render PostgreSQL database and run the reviewed migrations.
4. Compare important row counts, session/attendance totals, roster claims, role assignments,
   audit totals, and queue status before accepting traffic.
5. Copy every Supabase Storage photo into the private R2 bucket **using the same object key**. The
   database stores object keys, so preserving them avoids rewriting photo rows.
6. Verify that authorized photo reads work from R2 and that direct public access remains blocked.
7. Change the API environment to `STORAGE_DRIVER=r2` and provide the R2 credentials. Change
   `DATABASE_URL` to the Render database connection string and set the appropriate database TLS
   values.
8. Deploy the paid API, separate paid worker, and frontend. Set `JOB_RUNNER_MODE=worker`.
9. Run a read-only verification and a controlled check-in before directing the permanent QR or
   real participants to the new deployment.
10. Keep the Supabase project read-only or retained until the rollback window has expired and the
    owner has approved its disposal. Do not delete it immediately after cutover.

The reverse direction, from the paid provider layout to the zero-cost layout, follows the same
principle: export/verify PostgreSQL data, copy private photos while preserving keys, update
provider variables, run migrations, and verify before switching traffic.

## Important limits of “just change the variables”

Environment changes alone cannot safely move data between providers:

- Changing `DATABASE_URL` points the application at a different database; it does not copy rows.
- Changing `STORAGE_DRIVER` points photo reads at a different object store; it does not copy photo
  objects.
- Changing `JOB_RUNNER_MODE` changes who processes queued jobs; it does not run or drain existing
  jobs automatically.
- Changing a Google service-account key changes the integration identity; the replacement account
  must already have access to the workbook.
- Changing an email key changes delivery credentials; the sender/domain must already be approved
  by the provider.

Every provider switch therefore needs a backup, a verification step, and a reversible cutover.

## Safe rollback rule

If verification fails after a deployment switch:

- stop new writes if required to avoid diverging databases;
- restore the previous connection variables;
- run the previous deployment or start the previous worker;
- inspect queued jobs before replaying them;
- never delete the source database or photo bucket while rollback is possible; and
- record the cutover result and any duplicate/replay checks in the release evidence.

The zero-cost deployment is therefore a different hosting profile around the same application
boundaries, not an irreversible rewrite. The decision to return to paid services must be explicit,
because paid resources are outside the current project constraint.
