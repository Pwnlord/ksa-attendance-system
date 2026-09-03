# Zero-Cost Version Plan

> Read [`zero-cost-architecture-migration.md`](zero-cost-architecture-migration.md) alongside this
> plan. That guide explains how the current paid topology maps to the free topology and how to
> reverse the change later.

**Status:** Implemented locally — external deployment verification pending  
**Scope:** A zero-cost deployment using free-tier services  
**Deployment constraint:** Staging, the controlled pilot, and the intended production deployment must use only free-tier services. No paid Render resource, paid database plan, paid worker, or required payment method is allowed unless you explicitly change this decision.

This plan exists because the original Render Blueprint describes a separate background worker and a Render-managed database. Render does not provide those two resource types in the required Free form. The original paid Blueprint must not be deployed under the zero-cost constraint, but the application behavior and provider interfaces do not need to be discarded. The reversible before/after mapping is in [`zero-cost-architecture-migration.md`](zero-cost-architecture-migration.md).

This version can be used for development, demonstration, a small controlled pilot, and the intended low-traffic production deployment. It should not be described as highly available production until the free-tier limitations, backups, photo handling, and task processing have been addressed. If a provider cannot supply a required component for free, we must replace the provider or change the hosting topology; we must not silently introduce a paid service.

## Configuration versus hosting topology

The application is intentionally configured through environment variables. These values can be changed when moving from staging to production:

- `DATABASE_URL` points to the staging Supabase database first, then to the production database later.
- `PUBLIC_APP_URL` and `TRUSTED_ORIGINS` change from staging URLs to production URLs.
- Storage, email, Google Sheets, Sentry, and encryption values change from staging credentials to production credentials.
- The application code and database schema remain the same unless a separate product decision changes them.

One exception is the hosting shape of a background worker. A worker is a running process, not a credential or URL. A Render Free web service cannot be declared as a separate Render background worker just by changing an environment variable. The selected zero-cost arrangement is a protected one-shot task endpoint called by a free GitHub Actions schedule, with a protected Administrator-triggered fallback. The separate worker code and database queue remain in the repository so the same application can use them later if a paid or always-on topology is deliberately approved. Production is still constrained to free services under this plan.

## What stays the same

These important parts of the application remain:

- The NestJS backend remains the authority for attendance decisions.
- The browser continues to use the frontend `/api/v1` path.
- The server-managed login sessions and attendance-device recognition remain in place.
- The existing roles, permissions, audit records, rate limits, origin checks, CSRF protection, and safe error handling remain in place.
- Attendance is recorded in the database before reporting integrations are updated.
- Google Sheets remains a reporting copy, not the source of truth.
- Email verification remains optional for attendance, as decided in the PRD.
- Supabase Auth is not introduced. The application continues to manage its own sessions.

## Deployment changes

| Current design | Zero-cost design | Reason and consequence |
| --- | --- | --- |
| Render frontend web service | Render Free web service | The frontend may sleep when unused and the first request may be slow. |
| Render API on a paid plan | Render Free web service | The API can run for a pilot, but it may sleep and cannot use Render private networking as its API connection path. |
| Separate Render background worker | Keep the worker code; choose a zero-cost runner for the pilot | Render does not provide a Free background-worker plan. This is a hosting-topology limitation, not a reason to remove the worker logic from the application. |
| Render Postgres | Supabase Free PostgreSQL | Avoids the 30-day expiration of Render Free Postgres. Supabase Free still has storage, activity, pausing, and backup limitations. |
| Cloudflare R2 photo storage | Supabase private Storage bucket | Keeps photos behind access control while using the free storage allowance. The backend now has a Supabase storage adapter; the bucket must still be configured externally. |
| Frontend-to-API private `host:port` reference | Frontend rewrite to the API's public HTTPS URL | Free Render web services cannot receive private-network traffic. The browser can still use the frontend `/api/v1` path, but the API itself is publicly reachable and must retain its security controls. |
| Render pre-deploy migration command | Migration run manually from a controlled machine or later workflow | Render Free services do not support the current pre-deploy command. Migration timing must be recorded and verified. |

Supabase currently lists a Free plan with limited database and file storage. Free projects may pause after a period of low activity, and free-tier projects should maintain manual off-site database exports. [Supabase pricing](https://supabase.com/pricing), [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Supabase backups](https://supabase.com/docs/guides/platform/backups)

Render Free web services may sleep after inactivity, and Render Free Postgres expires after 30 days and does not provide backups. Render does not offer Free background-worker instances. [Render Free limitations](https://render.com/docs/free)

## What the background worker currently does

The application currently writes delayed tasks into a database task list. The separate worker checks that list continuously, performs each task, records success, and retries failures.

The tasks are:

- Open and close attendance sessions at their scheduled times.
- Send email-verification and password-reset links.
- Copy attendance and roster changes into Google Sheets.
- Close manual-verification cases after their expiry time.
- Delete replaced identification photos after the retention date.
- Retry failed tasks without losing the original record.

The task list can remain in the database for traceability, but without a continuously running worker it cannot be assumed that every task will run automatically at the exact scheduled time.

## Task-by-task zero-cost behavior

### Email verification and password reset

The API writes the email delivery task durably during registration or password-reset request. The free scheduler normally delivers it during the next job-runner call, with a manual Administrator-run fallback. This introduces a bounded delay rather than requiring a continuously running worker.

If delivery fails:

- The account or reset request is not silently treated as complete.
- The user sees a safe failure message.
- A resend action can be offered.
- The failed delivery is recorded without exposing the token or email contents in logs.

Resend can remain the email provider if its free allowance is sufficient. The account, sender address, and usage limits must be checked before using it for real participants.

### Google Sheets synchronization

Attendance success will not wait for Google Sheets. The free scheduler processes queued projection tasks, and an Administrator can use **Sync Sheets**, **Reconcile Sheets**, or the protected **Run due jobs** action when a report is needed.

The database remains correct if Google Sheets is unavailable. The Administrator must be able to retry the synchronization and see whether it succeeded or failed.

For a small pilot, this is acceptable because the spreadsheet is a report and not the attendance record. It is not equivalent to continuous automatic synchronization.

### Session opening and closing

The scheduled job runner and the API will check the configured session start and end times. The API also reconciles them whenever a participant or operator uses a session-related page or action.

This means:

- A participant cannot check in before the allowed start or after the allowed end.
- The session may not change its stored display status at the exact scheduled second if nobody is using the system at that moment.
- The next relevant request will reconcile the session against the clock.

If exact automatic state changes are required, a scheduled external trigger must be added later.

### Manual-verification case expiry

When a participant, Course Representative, or Administrator opens or acts on a case, the API will check whether the case has expired and close it if necessary.

This prevents an expired case from being approved, but it does not guarantee that the database status changes at the exact expiry minute when nobody accesses the case.

### Photo retention

Photo deletion is the most sensitive deferred task. The free scheduled runner attempts this work periodically, and the Administrator can run it manually if the schedule is delayed:

- An Administrator will run a clearly labelled cleanup action after the course-end date and retention period.
- The action will delete the private storage object first and then mark the database record as deleted.
- The action will create an audit record.
- A failed deletion will remain visible for retry.
- Production photo retention must not depend only on someone remembering to click a button.

Before using real participant photos in production, verify that the free scheduled trigger and manual cleanup recovery are operational. A paid/always-on worker is not required by this plan, but would be an optional later reliability upgrade only if explicitly approved.

### Retry handling

The database task records and failure information can remain. The Administrator will retry email, Sheets, or cleanup work through an explicit action where supported.

The API will not run a permanent polling loop inside a Free Render web service. The protected one-shot endpoint claims a bounded batch and exits; GitHub Actions calls it periodically and an Administrator can trigger the same operation manually.

## Supabase preparation checklist

The Supabase account and a separate staging project can be prepared now. Do not upload real participant data or photos yet.

1. Create or sign in to a Supabase account.
2. Create a project named something like `ksa-attendance-staging`.
3. Select the Free plan.
4. Choose a region reasonably close to the Render Frankfurt region if that option is available.
5. Create a strong database password and save it in a password manager.
6. From the Supabase **Connect** screen, keep the project reference and the **Shared Pooler — Session mode** connection string available for later configuration. This mode is suitable for a persistent backend on an IPv4-only network. Do not paste the connection string into chat or source control. [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
7. Create a private storage bucket named something like `attendance-photos-staging` only if we approve the Supabase Storage change. Do not upload photos yet.
8. Do not configure Supabase Auth, Realtime, or frontend direct database access. The NestJS backend remains responsible for access control.
9. Do not import the real roster or create real participant accounts in this project.

Supabase private buckets support access-controlled downloads and limited-time signed URLs. The bucket must remain private; a public bucket would allow anyone with a file URL to retrieve a photo. [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)

## Required zero-cost deployment-profile changes before deployment

The repository implementation is complete for these profile changes:

- Change the API and frontend Render services to Free plans.
- Do not create a separate Render worker resource in the zero-cost Blueprint; keep the worker implementation in the repository.
- Remove the Render Postgres resource from the zero-cost Blueprint.
- Remove `preDeployCommand` from the API service.
- Remove unsupported Free-tier shutdown-delay settings.
- Replace the Render database reference with a Supabase connection-string secret.
- Replace the private `host:port` frontend backend reference with the API public HTTPS URL.
- Add a documented manual migration and manual database-export procedure.
- Update staging acceptance tests to include sleeping services, delayed first requests, Supabase pause risk, provider failures, manual synchronization, and cleanup retry behavior.

The following external deployment steps remain before staging can be verified. They are not automatic consequences of changing database or provider variables:

- Use the protected one-shot job endpoint with the free GitHub Actions schedule and the Administrator fallback. Configure `JOB_RUNNER_MODE=endpoint` and a random `JOB_RUNNER_SECRET`.
- Keep the existing queue handlers and retry behavior. Verify scheduled email/Sheets processing, request-time session/case reconciliation, and auditable photo cleanup.
- Keep the standalone worker command available for a later explicitly approved paid/always-on topology; it is not deployed by the zero-cost Blueprint.

## Moving from staging to production

The normal move to production should primarily replace staging values with production values while keeping the same free-service topology:

- Production database connection string instead of the staging Supabase connection string.
- Production storage bucket and credentials instead of staging storage credentials.
- Production email sender/API key instead of the staging sender/API key.
- Production Google workbook/service account instead of the staging workbook/service account.
- Production Sentry project/DSN instead of the staging DSN.
- Production application URL and trusted origin instead of staging URLs.
- The free scheduled job endpoint and GitHub Actions workflow are configured for production values as well as staging.

The scheduler URL and secret are the only additional production settings for the free job arrangement. Production inherits the same sleeping, scheduling, backup, and reliability limitations. Paid services are outside this plan.

## What this version does not promise

- No exact-second automatic session transitions when nobody is using the system.
- No continuously running background task processor; queued work is eventually processed by the free scheduled endpoint or an Administrator fallback.
- No guaranteed immediate Google Sheets update.
- No exact-time photo deletion guarantee if the free scheduler is delayed; the job remains retryable and observable.
- No automatic database backups from the Free plans.
- No uninterrupted availability when a Free service or Supabase project pauses.
- No suitability for high-volume or high-consequence attendance operations without a later reliability upgrade.

## Recommended sequence

1. Prepare the separate Supabase staging project using the checklist above.
2. Configure the private storage bucket and free provider credentials without uploading real data.
3. Configure the GitHub Actions secrets `JOB_RUNNER_URL` and `JOB_RUNNER_SECRET`.
4. Run the local test suite and provider-failure tests.
5. Deploy only fictional staging data and verify the scheduled/manual job paths.
6. Review the pilot results before considering any real participant data.

No paid Render Blueprint should be pushed or deployed. A paid deployment is outside this plan.
