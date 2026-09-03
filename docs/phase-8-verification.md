# Phase 8 Verification — Security, Privacy, Reliability, and Accessibility Hardening

Date: 2026-09-03

Phase 8 is the release-hardening phase. It improves the local implementation and records the evidence required before staging, pilot, and production. It does not mean the application is already deployed or ready for public attendance.

## Delivered in this pass

- Production configuration validation now requires HTTPS origins, a public application origin, secure cookies, disabled API documentation, real private storage, Resend, Google Sheets, Sentry, and the token-encryption key.
- The backend enables production proxy handling, shutdown hooks, Helmet security headers, and no public Swagger/OpenAPI documentation in production.
- Cookie-authenticated state changes require a trusted origin; public requests remain usable without an origin when no session cookie is present.
- HTTP failures continue to use the safe error envelope and correlation ID. Internal HTTP and worker failures are reported to Sentry only as generic errors with safe tags.
- Verification and password-reset messages are encrypted inside durable PostgreSQL jobs and delivered through the configured memory provider locally or Resend in production. Attendance is not blocked by email verification.
- Superseded private photos now have a durable retention job. The worker deletes the private object first, marks the database row deleted only after storage succeeds, retries storage failures, and records a system audit event.
- The frontend sends no provider credentials, has safe security headers, rejects unsafe external login return paths, and includes verification/reset-password screens.
- Playwright-generated output is ignored by frontend linting so local quality gates remain repeatable after browser tests.

## Automated evidence

Backend, run from `backend/`:

```text
npm run format:check   PASS
npm run lint           PASS
npm run typecheck      PASS
npm test               PASS — 9 suites, 32 tests
npm run build          PASS
npm run db:check       PASS
npm run db:migrate     PASS — local PostgreSQL
worker boot smoke      PASS — started and stopped cleanly
```

Frontend, run from `frontend/`:

```text
npm run lint            PASS
npm run typecheck       PASS
npm run build           PASS
npm run test:e2e        PASS — 2 Chromium smoke tests
```

The backend tests cover production configuration rejection, trusted-origin behavior, protected-photo processing, encrypted email-job delivery, and retry-safe photo retention. The browser tests cover preserving the permanent check-in route through login and showing successful attendance after a backend commit.

## Known release gates

These items remain intentionally open because they require deployment configuration, real provider behavior, or human/device evidence:

- Deploy a restricted staging environment on Render Frankfurt with separate database, R2, email sender, Google workbook, Sentry project, and secrets.
- Verify the custom same-origin domain and `/api/*` proxy with Secure, host-only, SameSite=Lax cookies. Raw Render service URLs are not the participant authentication topology.
- Test the PostgreSQL worker through restart, lock recovery, provider outage, retry, and failed-job escalation scenarios. A local worker smoke test still depends on the local database being available when it is run.
- Verify the real Kora-approved Google service account/workbook and Resend sending-domain setup. No production Google credential was used in local testing.
- Add an explicit course-end date/time to the operational configuration before production photo retention is enabled. The current local fallback schedules the configured retention interval from photo approval because the existing model has no course-end field; this must be replaced or explicitly approved before go-live.
- Complete R2 private-access/lifecycle checks, database backup and restore rehearsal, Sentry filtering verification, Render alert ownership, and secret scanning.
- Run the wider acceptance suite, accessibility review, mobile browser matrix, slow-network checks, and performance checks on representative Android and iPhone devices.
- Resolve the current high PostCSS advisory deliberately. The available automatic fix requests a breaking Next.js 16 upgrade; it must not be applied without a reviewed upgrade and a full re-run of the frontend checks.

## Release interpretation

Phase 8 local hardening is in progress and the local quality gates above pass. Production use remains blocked until the security release gate in [`security-rules.md`](security-rules.md), the staging checklist in [`production-readiness.md`](production-readiness.md), and the applicable acceptance/device evidence are complete.
