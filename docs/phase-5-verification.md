# Phase 5 Verification — Manual Review, Device Replacement, and Operations

Date: 2026-09-03

Phase 5 implements the human exception and operational controls that sit after automatic attendance evaluation.

## Delivered

- Explicit participant manual-review requests for permission-denied, timeout, unavailable, unsupported, and clearly-remote outcomes.
- Automatic uncertain-case deduplication remains limited to `LOCATION_UNCERTAIN`.
- Participant case status/history and operator review queues with object-level authorization.
- Protected identity-photo access only on legitimate operator review detail responses; unavailable local photo objects fail safely rather than exposing storage details.
- Versioned approve/reject decisions with safe repeat behavior, required reasons, audit events, and one database attendance row per participant/session.
- Automatic case expiry through the PostgreSQL-backed worker at session close plus the configured manual grace period.
- Candidate device requests with separate random credentials, candidate unusable before approval, one-pending-request protection, and atomic old-device revoke/new-device activation.
- Course Representative self-approval denial for manual exceptions and device replacements.
- Controlled emergency manual attendance during an eligible open session.
- Authorized participant search and participant attendance history.
- Administrator-only closed-session attendance correction with mandatory reason, current-state update, before/after audit, and projection job enqueue.

## Automated checks

The following checks passed in `/backend`:

```text
npm run db:migrate
npm run db:check
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

The existing test suite passed 5 suites and 13 tests. The Phase 5 stateful paths were additionally exercised against the local PostgreSQL database and temporary API/worker processes.

## Local end-to-end evidence

- An unrecognized participant browser created a pending replacement request and received a candidate credential cookie; the candidate was not attendance-valid before approval.
- Administrator approval returned the request as `APPROVED`; database inspection showed exactly one `ACTIVE` and one `REVOKED` device for the participant.
- A fresh poor-accuracy reading returned `LOCATION_UNCERTAIN`, created one pending case, and created no attendance row.
- A Course Representative's own manual-exception approval returned `SELF_APPROVAL_FORBIDDEN` and their own case was excluded from the operational queue.
- Administrator approval created one `MANUAL` `PRESENT` record; a denied-location attempt created no automatic case, while its explicit request created one `PARTICIPANT_REQUEST` case and a repeat reused it with HTTP 200.
- Authorized participant search returned minimum participant fields; a normal participant received HTTP 403.
- An Administrator correction changed current attendance to `ABSENT` and returned an audit-event identifier.
- A durable `MANUAL_CASE_EXPIRE` job was claimed by the PostgreSQL worker and changed an expired pending case to `EXPIRED` with a `SYSTEM` audit event.

No raw credentials, protected photo URLs, exact locations, or secret values are recorded in this verification document.

## Scope boundary

Phase 6 now consumes the authoritative attendance records and durable jobs through the Google Sheets provider, retry/reconciliation behavior, and denominator/reporting projections. The production frontend remains intentionally deferred until its relevant backend/API slices are stable.

## Gate

AT-006, AT-007, AT-008, AT-013, and relevant AT-014 behavior passed through automated foundation checks plus local API/worker smoke verification. The remaining release work is Sheets projection, production frontend integration, and final hardening/pilot evidence.
