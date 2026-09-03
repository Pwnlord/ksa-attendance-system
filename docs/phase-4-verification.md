# Phase 4 Verification — Session and Automatic Attendance Core

Date: 2026-09-03

Phase 4 implements the backend path from an operational session to an authoritative automatic attendance record.

## Delivered

- Protected `CourseConfig` read/update with optimistic version checks, audit reasons, `Africa/Lagos`, and the approved policy defaults.
- Versioned session creation, scheduling, opening, closing, extending, cancelling, and Administrator-only reopening.
- Same-day Course Representative extension cap of two hours beyond the immutable original end.
- PostgreSQL uniqueness protection for one open session per course.
- Separate lifecycle worker command: `npm run jobs:work`.
- Durable automatic activation and closure jobs with `SYSTEM` audit attribution for automatic closure.
- Participant-safe `GET /api/v1/attendance/context`.
- `POST /api/v1/attendance/check-in` with required idempotency keys, separate attendance-device recognition, fresh location evaluation, and safe result outcomes.
- Haversine venue distance calculation, 25-metre distance rounding, 30-second freshness, 150-metre maximum automatic accuracy, 200-metre pass radius, and 500-metre clearly-remote boundary.
- Atomic `AttendanceAttempt` plus `AttendanceRecord` creation. A committed record queues an asynchronous Sheets projection job only after the database transaction succeeds.
- Technically uncertain readings create one deduplicated pending manual-verification case. Explicit manual-request actions for denied/unavailable/no-fix/clearly-remote results remain Phase 5.
- Raw latitude and longitude are not persisted or included in audit/job payloads.

## Automated checks

The following checks passed in `/backend`:

```text
npm run db:migrate
npm run db:check
npm run typecheck
npm run lint
npm test
npm run build
```

The test suite passed 5 suites and 13 tests, including geofence pass, uncertainty, clearly-remote, stale-reading, rounding, and existing Phase 2/3 security tests.

## Local end-to-end evidence

Using temporary local-only fixtures against PostgreSQL and the API on port 3011:

- A Course Representative could create a draft, open it with an expected version, and close it with the next expected version.
- A scheduled session that had passed its end was safely closed by the lifecycle worker without accepting attendance.
- A short open session was automatically closed by the worker at its effective end with no closing user ID and a `SYSTEM` audit event.
- A fresh accurate venue reading returned `201 ATTENDANCE_RECORDED` and created exactly one `PRESENT` QR record.
- Repeating the same idempotency key returned `200 ALREADY_CHECKED_IN` with the original record and time.
- A clearly remote accurate reading returned `422 CLEARLY_REMOTE` without an attendance record.
- An ambiguous reading returned `422 LOCATION_UNCERTAIN` with one pending case.
- The successful record created one pending `ATTENDANCE_SHEETS_SYNC` outbox job.
- Participant access to operational sessions and protected configuration returned `403`.
- The temporary API and worker processes were stopped after verification; PostgreSQL remains available as the user-managed local service.

## Scope boundary

Phase 5 implemented manual-verification decisions, participant-requested cases, device replacement, operational dashboard queries, and case expiry. Phase 6 implements the Google Sheets provider, projection/reconciliation, and denominator/reporting views. Those later slices consume the records and durable jobs established here.
