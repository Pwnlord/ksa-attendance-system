# Supabase Cron Job Runner

## Purpose

The application creates background jobs in PostgreSQL when it needs to update Google Sheets,
send an email, close a session, expire a manual-review case, or perform another delayed task.
The Render API already contains the code that processes those jobs through:

```text
POST https://ksa-attendance-staging-api.onrender.com/api/v1/internal/jobs/run
```

This document configures Supabase as the automatic reminder that calls that endpoint. Supabase
does not perform the Sheets work itself; it tells the Render API to process the waiting jobs.

## Active scheduler arrangement

```text
Participant check-in
  -> PostgreSQL records attendance and queues a Sheets job
  -> Supabase Cron calls the protected Render endpoint every 5 minutes
  -> Render claims and processes a bounded batch of due jobs
  -> Google Sheets is updated
```

The database remains authoritative. A delay or Google failure must not undo a successful
attendance record. The Admin **Run due background jobs** action remains an emergency fallback.

GitHub Actions is no longer the primary five-minute scheduler. The repository workflow remains
available for manual runs and runs once per hour as a low-frequency fallback. This avoids using a
private-repository GitHub runner for thousands of short jobs each month.

## One-time Supabase setup

Use the staging Supabase project only. Do not put the Render secret in Git, the frontend, this
document, screenshots, or chat.

### 1. Enable the extensions

In the Supabase Dashboard for `ksa-attendance-staging`:

1. Open **Integrations → Cron** and enable `pg_cron`.
2. Open **Database → Extensions** and enable `pg_net`.
3. Confirm that the Vault feature is available for storing the two scheduler secrets.

Supabase Cron uses `pg_cron` for recurring schedules and `pg_net` for HTTP requests. The hosted
Supabase platform supports this arrangement.

### 2. Store the scheduler values in Vault

Run the following in the Supabase SQL Editor after replacing only the marked secret placeholder.
The URL is not confidential; the secret is.

```sql
select vault.create_secret(
  'https://ksa-attendance-staging-api.onrender.com/api/v1/internal/jobs/run',
  'ksa_attendance_job_runner_url'
);

select vault.create_secret(
  'REPLACE_WITH_THE_EXACT_RENDER_JOB_RUNNER_SECRET',
  'ksa_attendance_job_runner_secret'
);
```

The second value must exactly match the Render API's `JOB_RUNNER_SECRET`. If a secret with either
name already exists, update it in Vault instead of creating a duplicate.

### 3. Create the five-minute Cron job

Run this after both Vault values exist:

```sql
select cron.schedule(
  'ksa-attendance-job-runner',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'ksa_attendance_job_runner_url'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-job-runner-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ksa_attendance_job_runner_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  ) as request_id;
  $$
);
```

The schedule is every five minutes. Cron schedules use UTC, but this schedule is interval-based,
so the timezone does not affect it.

If the job already exists, do not create a second scheduler with a different name. Use the
Supabase Cron dashboard to inspect or edit `ksa-attendance-job-runner`, or unschedule it first and
create it again.

## Verification

1. Open the Supabase Cron job history for `ksa-attendance-job-runner`.
2. Confirm a run is recorded approximately every five minutes.
3. Create a staging test attendance or leave the current pending job in place.
4. Within the next run, confirm the pending job count falls and the row appears in the configured
   Google workbook.
5. Confirm the Admin Sheets page eventually shows zero pending and zero failed projection jobs.

If a Cron run is recorded but the queue does not move, inspect the response in `pg_net` history and
the Render API logs. A `401` usually means the Vault secret does not exactly match Render.

## What remains configured in Render

Keep these API values:

```text
JOB_RUNNER_MODE=endpoint
JOB_RUNNER_SECRET=<same secret stored in Supabase Vault>
```

Google Sheets credentials remain in Render. Supabase Cron does not need the workbook ID, service
account email, private key, Resend credentials, or frontend URL.

## GitHub fallback

The repository workflow is intentionally still available:

- Automatic fallback: once per hour at minute 17.
- Manual fallback: GitHub Actions → **Fallback zero-cost background jobs** → **Run workflow**.

Its secret values remain useful as a backup, but GitHub is no longer required for normal five-minute
processing.

## Rollback

To return to GitHub as the primary scheduler:

1. Unschedule `ksa-attendance-job-runner` in Supabase Cron.
2. Change `.github/workflows/zero-cost-jobs.yml` back to `*/5 * * * *`.
3. Confirm `JOB_RUNNER_URL` and `JOB_RUNNER_SECRET` are present as GitHub repository secrets.
4. Push the workflow change and verify scheduled runs.

The job queue and Render endpoint do not change during this switch.
