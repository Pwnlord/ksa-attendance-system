# Phase 9 Release Plan — Staging, Pilot, and Production

## Purpose

Phase 9 moves the KSA Attendance System from locally verified software toward a controlled public release. It is not one large deployment action. It has three gates, and each gate must produce evidence before the next one begins.

```text
Finish Phase 8 local blockers
        ↓
Gate 1: Deploy and validate staging
        ↓
Gate 2: Run the controlled venue pilot
        ↓
Gate 3: Complete the production checklist and go live
```

The database remains the authority throughout. Google Sheets is only a reporting projection. Real participant data and identification photos must not be used in staging unless the pilot data has been explicitly approved.

## Current status

- Phase 8 local hardening: in progress; local quality gates pass.
- Gate 1 — Staging preparation: in progress; deployment has not started.
- Gate 2 — Venue pilot: blocked until staging passes.
- Gate 3 — Production release: blocked until the pilot and production checklist pass.

## Before Gate 1: close or explicitly accept Phase 8 blockers

- Decide how the explicit course end date/time will be stored so photo deletion truly occurs at course end plus the configured retention period. The current local fallback schedules from photo approval and is not sufficient for production.
- Resolve the frontend dependency advisory deliberately. Do not apply the automatic breaking Next.js upgrade without review and a full test run.
- Confirm the owner for Render, PostgreSQL backups, R2, Resend, Google Sheets, Sentry, and participant support.
- Confirm that no real production Google credential, real participant photo, or production secret is present in source code, fixtures, screenshots, or local test output.

# Gate 1 — Staging

## Goal

Create a restricted, production-like environment where the team can test deployment, integrations, security, accessibility, failure recovery, and operations without exposing the system to normal participants.

Use the detailed [`Render staging setup runbook`](render-staging-setup.md) while completing this gate.

## Staging environment

Use separate staging resources:

- Render Frankfurt services for the Next.js frontend, NestJS API, and PostgreSQL-backed worker.
- A separate managed PostgreSQL database. The staging Blueprint uses a paid minimum database plan because Render Free Postgres does not provide backups.
- A private test-only Cloudflare R2 bucket.
- A test Resend sender/domain or a controlled test-recipient setup.
- A separate Google test workbook and least-privilege service account.
- A separate Sentry project or environment with replay disabled and sensitive-field filtering.
- A restricted staging URL or access control in front of the application.

Never reuse production database credentials, R2 keys, Google credentials, or email credentials in staging.

The staging Blueprint leaves the frontend and API on Render's Free plan for an inexpensive first smoke deployment, but the worker uses Render's minimum paid plan because background workers do not have a Free plan. If staging is being used as a serious performance or venue rehearsal, upgrade the frontend and API to the same paid starter-sized plan before testing; Free services can sleep or restart and are not suitable for production.

## Staging setup checklist

- [ ] Create the Render project in Frankfurt.
- [ ] Create separate frontend, backend, worker, and managed PostgreSQL services.
- [ ] Use the staging-only root `render.yaml` Blueprint as the deployment starting point; review service names and resource plans before syncing it.
- [ ] Set the Node/runtime versions explicitly.
- [ ] Configure staging secrets only in Render's environment settings or secret manager.
- [ ] Set `NODE_ENV=staging` and use staging-specific database/storage/email/Sheets/Sentry values.
- [ ] Set a restricted HTTPS public application origin and trusted origin.
- [ ] Verify the frontend `/api/*` rewrite reaches the backend.
- [ ] Confirm cookies are Secure, HttpOnly, host-only, and SameSite=Lax in the deployed environment.
- [ ] Confirm production API documentation is not exposed accidentally; staging documentation may be enabled only if access is restricted.
- [ ] Apply reviewed database migrations.
- [ ] Bootstrap one staging Administrator through the controlled bootstrap process.
- [ ] Create fictional roster entries and synthetic sessions.
- [ ] Configure the staging R2 bucket as private and verify direct public access fails.
- [ ] Configure test email delivery and confirm verification/recovery links use the staging origin.
- [ ] Configure the test Google workbook and verify only the target workbook is shared.
- [ ] Configure Sentry filtering and confirm session replay is disabled.
- [ ] Configure health checks, worker monitoring, backups, and alert contacts.

## Staging validation checklist

Run the applicable scenarios from [`acceptance-tests.md`](acceptance-tests.md):

- [ ] Registration matches the approved roster and claims the correct entry.
- [ ] Email verification is sent but does not block attendance.
- [ ] Password recovery works only for verified email and never approves a new device.
- [ ] Login persistence and logout behavior match the separate session/device-cookie design.
- [ ] The permanent QR route preserves the intended check-in flow.
- [ ] Automatic attendance uses fresh location, server time, active device, open session, and duplicate protection.
- [ ] Uncertain, clearly remote, denied, unavailable, and unsupported location outcomes show the correct manual path.
- [ ] Manual verification, device replacement, session extension, cancellation, and correction enforce role permissions.
- [ ] Course Representative cannot reopen a closed session or approve their own exception.
- [ ] Administrator-only configuration, role, audit, photo, Sheets, and correction controls are protected.
- [ ] Private photos cannot be fetched directly and signed URLs expire as designed.
- [ ] Photo replacement approval and retention job behavior are verified without exposing photos in logs or Sheets.
- [ ] Google Sheets outage does not remove attendance success; retry and reconciliation work.
- [ ] Worker restart, stale locks, failed jobs, and safe retries are visible to the Administrator.
- [ ] Rate limits return safe `429` responses and `Retry-After` values.
- [ ] Generic errors contain no stack traces, SQL, secrets, internal paths, tokens, or exact coordinates.
- [ ] Database backups and a non-production restore procedure are tested.

## Staging accessibility and device review

Test at minimum on:

- [ ] Android Chrome.
- [ ] iPhone Safari.
- [ ] Desktop Chrome or Edge for operators.

Check keyboard operation, visible focus, labels, status announcements, contrast, zoom/large text, reduced motion, touch target size, loading states, empty states, retry states, and readable error messages.

## Gate 1 exit criteria

Gate 1 passes only when:

- Deployment is repeatable and rollback/forward-fix steps are known.
- The staging security and acceptance checks pass or have named, explicitly accepted risks.
- The same-origin cookie and `/api/*` proxy behavior is proven over HTTPS.
- Worker, database, storage, email, Sheets, Sentry, health checks, alerts, and backups have evidence.
- No real production secrets or unapproved participant data entered staging.
- The product owner approves the controlled venue pilot.

# Gate 2 — Controlled venue pilot

## Goal

Use a small approved participant group at the real venue to validate real GPS, QR, browser, device, network, and operator behavior before normal launch.

## Pilot preparation

- [ ] Select and record the approved pilot participants and support contact.
- [ ] Use production-like services with pilot-scoped data and access.
- [ ] Confirm the wall QR points only to the stable public check-in route and contains no credential.
- [ ] Prepare representative Android and iPhone devices.
- [ ] Brief the Course Representative and Administrator on manual verification, device replacement, cancellation, and support escalation.
- [ ] Record the configured geofence, accuracy, session, retention, and rate-limit values before testing.

## Pilot scenarios

- [ ] First-time registration and immediate attendance without email verification.
- [ ] Returning participant scans the QR on a later attendance day and verifies expected login/session persistence.
- [ ] New browser/device is recognized as requiring device approval rather than being silently rebound.
- [ ] Accurate in-venue GPS succeeds.
- [ ] Poor accuracy or gray-zone distance routes to uncertainty/manual review.
- [ ] Denied, unavailable, unsupported, stale, and clearly remote location outcomes behave safely.
- [ ] Duplicate scan returns the existing attendance result.
- [ ] Course Representative opens, extends, closes, and cancels within policy.
- [ ] Administrator handles manual review, device replacement, correction, and recovery.
- [ ] Slow or interrupted network does not create duplicate attendance or false success.
- [ ] Google outage and recovery preserve authoritative attendance.
- [ ] Operators can see queues and safe health information.

## Pilot evidence

Record dates, device/browser, network conditions, observed outcome, expected outcome, screenshots without personal data, and the resulting configuration or defect. Do not tune the geofence silently. Every change to pilot-tuned values must be approved and recorded.

## Gate 2 exit criteria

Gate 2 passes only when:

- Representative devices complete the core journey reliably.
- Location results are understood and the chosen thresholds are evidence-based.
- Operators can recover from ordinary failures without engineering intervention.
- No unresolved issue threatens attendance correctness, privacy, authorization, accessibility, or supportability.
- Remaining risks have an owner and explicit product-owner acceptance.

# Gate 3 — Production checklist and launch

## Production configuration

- [ ] Create the production Render project and services in Frankfurt.
- [ ] Create the managed PostgreSQL database with backups and restore access.
- [ ] Configure the private production R2 bucket and lifecycle/retention controls.
- [ ] Configure Resend sending-domain authentication with SPF, DKIM, and DMARC.
- [ ] Configure the Kora-owned or approved least-privilege Google service account and target workbook.
- [ ] Configure Sentry with replay disabled, sensitive-field filtering, alert ownership, and retention settings.
- [ ] Configure production HTTPS, custom domain, same-origin `/api/*` routing, and secure host-only cookies.
- [ ] Set production secrets only through the deployment secret manager.
- [ ] Set `API_DOCS_ENABLED=false`, `COOKIE_SECURE=true`, `STORAGE_DRIVER=r2`, `EMAIL_DRIVER=resend`, and `GOOGLE_SHEETS_DRIVER=google`.
- [ ] Configure the explicit course end date/time before enabling production photo-retention scheduling.

## Production data and operations

- [ ] Run reviewed migrations from the release artifact.
- [ ] Bootstrap the first Administrator securely and remove one-time bootstrap material.
- [ ] Import the approved roster through the Admin workflow.
- [ ] Verify duplicates, disabled entries, disputed claims, and enrollment-effective dates.
- [ ] Configure venue, timezone, session defaults, geofence values, retention, and rate limits.
- [ ] Confirm support and escalation contacts.
- [ ] Confirm backup, restore, rollback, and forward-fix procedures.
- [ ] Confirm no staging data, test photos, credentials, or sensitive screenshots are present in production artifacts.

## Go-live approval

Go-live requires written approval that:

- [`security-rules.md`](security-rules.md) is complete.
- Applicable acceptance tests and the accessibility/device matrix pass.
- Staging and the controlled pilot pass.
- Database backups and restore responsibility are confirmed.
- Third-party ownership and credential rotation are confirmed.
- Support, escalation, and rollback procedures are known.
- Remaining risks have named owners and explicit acceptance.

## Launch and first monitoring window

Launch gradually. During the initial launch window, monitor:

- Sign-in and registration failures.
- Attendance outcomes and duplicate attempts.
- Device-change and manual-review queues.
- Worker backlog, failed jobs, and stale locks.
- Google Sheets projection health and reconciliation requests.
- Email delivery and bounce signals.
- Database, storage, Render health checks, and Sentry events.
- Participant and operator support requests.

Attendance success must not be withdrawn because Google Sheets, email, or another reporting integration is delayed.

## Production exit criteria

Production is considered released only when the service is live under the approved custom HTTPS origin, the first attendance session completes successfully, monitoring is active, the support owner is available, and the post-launch review confirms no critical security, privacy, data-integrity, or accessibility issue.
