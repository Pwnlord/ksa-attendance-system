# Phase 6 Verification — Google Sheets Projection and Reporting

Date: 2026-09-03

Phase 6 implements Google Sheets as an asynchronous, human-readable projection of authoritative PostgreSQL state. Attendance success remains independent of workbook availability.

## Delivered

- Credential-swappable Google Sheets provider using a least-privilege service-account JWT and the Google Sheets REST API.
- Safe local memory provider for development and tests; no Google credentials are required locally.
- `Master Register` projection from the approved roster and current participant account state.
- One dated tab per real attendance session, with deterministic suffixes for the exceptional case of multiple sessions on one date.
- Cross-session `Summary` with `PRESENT`, `ABSENT`, `N/A`, and `PENDING` states plus an applicable attendance percentage.
- `N/A` for sessions before a participant's enrollment-effective date, excluded from percentage denominators.
- Clearly marked `CANCELLED` session tabs excluded from Summary columns and denominators.
- Formula-injection protection for every exported cell and no photos, exact coordinates, credentials, or raw security logs in projections.
- Durable PostgreSQL worker handling attendance/session/roster projection jobs and Admin reconciliation jobs.
- Retry schedule: initial attempt, 5 seconds, 1 minute, 5 minutes, 15 minutes, then randomized 30–60 minute intervals.
- Admin-only sanitized health, retry, and scoped reconciliation endpoints.
- Stable source keys and full-tab replacement make retries and reconciliation idempotent from database state.

## Automated checks

The following checks passed in `/backend`:

```text
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run db:check
npm run db:migrate
```

The test suite passed 6 suites and 18 tests. New reporting tests cover late enrollment, cancellation exclusion, closed-session absence, percentages, tab naming, formula injection, and retry timing.

## Local end-to-end evidence

- The Admin Sheets health endpoint returned `HEALTHY` with zero pending and failed projection jobs after the PostgreSQL worker processed the local queue.
- An in-process full projection produced `Master Register`, dated session tabs, and `Summary` with the expected headers and row shapes.
- The API and worker started successfully with the memory provider; both temporary processes were stopped after verification.
- Google credentials were not present in the local environment, so no external workbook was contacted.

## Production handoff

Set `GOOGLE_SHEETS_DRIVER=google`, provide the target `GOOGLE_SHEETS_SPREADSHEET_ID`, service-account email, and private key through the deployment secret manager, then share only the target workbook with that service account. Ownership can move from the developer project to Kora's project by replacing configuration values; application code does not change.

Production hardening must verify a real workbook, Google quota/outage recovery, manual row/tab deletion followed by reconciliation, and Render worker/backlog alerting.
