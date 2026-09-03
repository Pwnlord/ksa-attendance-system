# Production Readiness and Environment Plan

## Purpose

This document records what “production” means for the KSA Attendance System and the path from local development to a safe public launch. A successful local build is not a production release. Production means real participants use the system with real attendance records, real private photos, and real operational consequences.

The PRD and approved decisions remain authoritative. This document translates them into an environment and release checklist.

## Environment model

| Environment | Purpose | Data and integrations | Public use |
| --- | --- | --- | --- |
| Local development | Build and automated verification | Local PostgreSQL; fictional data; memory Sheets/storage/email providers where supported | No |
| Staging | Deployment, integration, security, and accessibility testing | Separate database, private test storage, test email sender, test workbook, synthetic participants | Restricted to the team |
| Pilot | Limited real-world venue verification | Production-like services with approved pilot data and a controlled participant group | Approved pilot users only |
| Production | Normal Academy attendance | Managed production PostgreSQL, private R2, Resend, Kora-approved Google service account/workbook, Sentry, and worker | Yes |

Every environment must have separate secrets, database credentials, photo storage, email configuration, and Google workbook access. Staging or local data must not be copied into production without an explicit approved process.

## Approved production topology

Render Frankfurt hosts separate services for the Next.js frontend, NestJS backend, and PostgreSQL-backed background worker, plus managed PostgreSQL. Cloudflare R2 stores private photos. Resend delivers email. Google Sheets is an asynchronous reporting projection, not the attendance source of truth.

Participants use one custom HTTPS origin. The frontend serves the application and proxies `/api/*` to the backend over the private service connection or equivalent. Authentication and attendance-device cookies remain Secure, HttpOnly, host-only, SameSite=Lax cookies. Raw `onrender.com` service URLs are not the participant-facing authentication topology.

## Services and ownership

Before production, the owner must identify the person responsible for each service:

- Render project, service deploys, environment variables, health checks, and rollback.
- Managed PostgreSQL backups, restore access, migrations, and database access review.
- Cloudflare R2 private bucket, lifecycle rules, access keys, and photo-retention verification.
- Resend sending domain, SPF/DKIM/DMARC, sender address, bounce handling, and email templates.
- Kora-owned Google Cloud service account with access only to the approved workbook. Credential handoff must be a configuration change, not a code change.
- Sentry project with replay disabled, sensitive-field filtering, alert ownership, and retention settings.
- Operational support contact for Course Representatives and participants.

## Path to production

### 1. Complete Phase 8 hardening

- Resolve dependency advisories without applying an unreviewed breaking framework upgrade.
- Verify secure headers, HTTPS behavior, cookies, origin/CSRF protection, rate limits, generic errors, and authorization boundaries.
- Verify private photo access, metadata removal, retention, deletion, and absence of photos/secrets in telemetry.
- Test durable jobs through restarts, retries, outage recovery, and Sheets reconciliation.
- Run broader browser E2E, accessibility, mobile, network-failure, and performance checks.

### 2. Create staging

- Create separate Render services and a separate managed staging database.
- Configure staging secrets only in the host's secret manager/environment settings.
- Run reviewed migrations and bootstrap a staging Administrator through the secure CLI/deployment process.
- Configure synthetic roster entries, private test photos, test email, and a test workbook.
- Verify the frontend/API same-origin route and all health checks.

### 3. Validate staging end to end

Run the applicable scenarios in `docs/acceptance-tests.md`, including registration, login and recovery, device replacement, automatic check-in, uncertainty/manual review, session lifecycle, cancellation, correction, Sheets outage/recovery, authorization, retention, and rate limiting.

Record results, defects, owners, and evidence. A passing build alone is not evidence that these workflows pass.

### 4. Prepare production services

- Create the production Render project in Frankfurt and set the Node/runtime versions explicitly.
- Create the managed PostgreSQL database, backups, access restrictions, and restore procedure.
- Configure private R2 storage and verify its public-access posture.
- Configure Resend sending-domain authentication and production-safe templates.
- Create or receive the Kora-owned Google service-account credential and share only the target workbook.
- Configure Sentry filtering, replay disabled, alerts, and Render health checks/logs.
- Set production environment values, including `COOKIE_SECURE=true`, production origins, storage/email/Sheets drivers, encryption keys, and database URLs. Never commit these values.

### 5. Migrate and seed controlled data

- Run migrations using the reviewed release artifact.
- Bootstrap the first production Administrator securely and rotate/remove one-time bootstrap material.
- Import the approved roster through the Admin workflow and verify duplicate/disabled/disputed rows.
- Configure the course timezone, venue, attendance thresholds, session defaults, rate limits, and retention policy.
- Verify that no real participant photo or identity data was used in staging screenshots, logs, fixtures, or test reports.

### 6. Run the venue pilot

Use an approved small group on representative Android and iPhone devices. Measure real GPS behavior, browser persistence, QR scanning, slow networks, manual review, device replacement, session closure, and operator recovery. Tune geofence values only from recorded evidence and approved configuration changes.

### 7. Approve go-live

Go-live requires written approval that:

- The security release gate in `docs/security-rules.md` is complete.
- Applicable acceptance tests and the accessibility/device matrix pass.
- Database backups and restore responsibility are confirmed.
- Support and escalation contacts are known.
- Rollback/forward-fix procedures are documented.
- Production secrets and third-party ownership are confirmed.
- Remaining risks have named owners and explicit acceptance.

### 8. Monitor after launch

For the initial launch window, monitor sign-in failures, attendance outcomes, device-change/manual-review queues, background-job backlog, Sheets health, email delivery, database health, storage access, Sentry events, and participant support. Attendance success must not be withdrawn because a reporting projection is delayed.

## Release artifacts

Each production release should retain:

- Commit/build identifier and migration list.
- Environment configuration checklist without secret values.
- Acceptance, security, accessibility, and pilot evidence.
- Backup/restore verification date.
- Third-party ownership and credential-rotation record.
- Known risks, rollback/forward-fix plan, and support contacts.

## Current position

As of 2026-09-03:

- Local backend, database, worker, mockup, and core production frontend are implemented and locally verified.
- The local frontend has passing lint, typecheck, production build, and two Chromium smoke tests.
- Local Sheets verification uses the memory provider; no production Google credential was used.
- Staging and production services, domain, live third-party credentials, venue pilot, and final security release gate are not yet complete.
- The frontend dependency audit reports a high PostCSS advisory through the current Next.js 15 dependency tree. npm recommends a breaking Next.js 16 upgrade; Phase 8 must resolve this deliberately and re-run all checks.
- The current local photo-retention fallback schedules deletion from photo approval because the existing course configuration has no explicit course-end field. Production must add and operate that course-end input, or record an approved policy change, before enabling the retention process.

## Related documents

- `docs/general-implementation-plan.md`
- `docs/security-rules.md`
- `docs/acceptance-tests.md`
- `docs/open-decisions.md`
- `backend/README.md`
- `frontend/README.md`
