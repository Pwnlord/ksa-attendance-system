# KSA Attendance System — Repository Guidance

This file applies to the entire repository. It is the working contract for coding agents and contributors.

## Start Here

Before changing product behavior, read `context/KSA_Attendance_System_PRD_v1.0.pdf`. The PRD is the product source of truth. In it, **MUST** is mandatory, **SHOULD** needs an equivalent outcome or a documented reason for deviating, and **MAY** is optional.

Then read `docs/README.md` and the documents relevant to the task. In particular:

- `docs/general-implementation-plan.md` defines delivery order and phase gates.
- `docs/open-decisions.md` records approved product/architecture choices and explicitly deferred scope.
- `docs/adr-001-mvp-architecture.md` records the accepted technical architecture and reversal strategy.
- `docs/domain-model.md` and `docs/state-machines.md` define concepts, invariants, and lifecycle behavior.
- `docs/permissions-matrix.md` defines role and object-level authorization.
- `docs/api-contract.yaml` is the September 2026 frontend/backend implementation baseline.
- `docs/security-rules.md`, `docs/error-behavior.md`, and `docs/acceptance-tests.md` define cross-cutting release behavior.
- `mockup/screens.md` defines the text-first UX and state inventory.

The repository has completed planning, the Phase 1 mockup, the locally verified Phase 2 NestJS backend foundation, the Phase 3 identity/registration/roles/private-photo backend slice, the Phase 4 session/automatic-attendance backend slice, the Phase 5 manual-review/device/operations backend slice, the Phase 6 Google Sheets projection/reporting implementation in `/backend`, and the core Phase 7 production frontend in `/frontend`. Use Next.js/TypeScript/Tailwind in `/frontend`, NestJS/TypeScript in `/backend`, PostgreSQL with Drizzle, and the remaining choices in `docs/open-decisions.md`. Revisit an approved choice only through an explicit superseding decision and ADR where material.

Contract precedence is:

1. The current PRD, especially its `MUST` requirements.
2. Explicit approved product decisions and ADRs that clarify, but do not silently override, the PRD.
3. The domain, state, permissions, security, error, API, acceptance-test, and mockup contracts in `docs/` and `mockup/`.
4. Implementation behavior.

When lower-level documents conflict, stop the affected implementation work, preserve the stronger security/privacy/data-integrity interpretation, and reconcile the documents before proceeding.

When requirements conflict or are ambiguous:

1. Preserve the PRD's security, privacy, auditability, accessibility, and data-integrity guarantees.
2. Prefer the simplest implementation that supports the ordinary participant flow and the required human exception path.
3. Record material product or architecture decisions in an ADR or equivalent project document; do not silently invent business policy.

## Product in One Paragraph

This is a mobile-first web attendance system for an approximately 12-week Kora Sales Academy class. A permanent wall-mounted QR code opens a stable check-in route. It is not a secret and is never an authorization token. A participant is marked present only after server-side checks confirm an authenticated participant, an effective open attendance session, the participant's active registered attendance browser/device, acceptable venue proximity, and no existing attendance for that participant and session. Course Representatives and Administrators handle physical-presence exceptions. The application database is authoritative; Google Sheets is an asynchronous, human-readable reporting projection.

## Repository Areas and Responsibilities

- `context/` contains product source material and is not application code.
- `docs/` contains implementation contracts, decisions, acceptance criteria, and the general plan. Keep these documents synchronized with behavior.
- `mockup/` contains the text-first specification and later a static clickable prototype. It is a review artifact, not the production frontend.
- `backend/` will contain the NestJS authoritative API, Drizzle/PostgreSQL persistence, PostgreSQL-backed jobs, private-storage adapters (Supabase for the active zero-cost profile and R2 for the reversible legacy profile), authorization, audit, and domain rules.
- `frontend/` contains the production responsive web client. It consumes the backend through the same-origin `/api/*` rewrite and must not become an authority for attendance, session, device, role, or geofence decisions.

Do not place real authentication, durable attendance logic, Google credentials, real participant information, or real identification photos in the mockup. A clickable mockup may simulate states using clearly fictional fixtures and reviewer-only scenario controls. It must not be presented as proof that backend security or data-integrity rules work.

The production frontend may guide users and hide unavailable controls, but it must never become the authority for role, session, time, device, duplicate, geofence, manual-approval, or attendance validity.

## Non-Negotiable Domain Invariants

- The permanent QR contains no participant credential or secret.
- The application database is the system of record. Never make Google Sheets availability part of a successful attendance transaction.
- At most one attendance session may be effective/open for the initial course deployment.
- Enforce one final attendance record per `(session_id, participant_id)` with a database uniqueness constraint. Concurrent duplicate submissions return the existing record rather than failing or inserting twice.
- Each participant has at most one active attendance-device credential. Approving a replacement revokes the previous credential immediately.
- Authentication and attendance-device recognition are separate. A user may access their account from a new device, but that device cannot submit attendance until approved.
- An attendance session represents a real class event, not merely a Wednesday. No session means no attendance and no absence. Cancelled sessions never enter attendance denominators.
- Server time is authoritative. Store timestamps in UTC where practical and render/report them in the configured course timezone, `Africa/Lagos`.
- Participant serial numbers use exactly `KSA-XX`, where each `X` is a digit. Trim input and normalize the prefix to uppercase before validation. Serial number, normalized email, and normalized phone are unique. Participants cannot edit their serial number.
- Ordinary registration atomically claims one eligible `UNCLAIMED` roster entry; sessions before its `enrollmentEffectiveDate` are `N/A`, never Absent.
- Normal registration grants only the Participant role. There is exactly one active Course Representative unless product policy explicitly changes, and there must always be at least one active Administrator.
- Course Representatives cannot approve their own device replacement or use a manual bypass to approve their own attendance. Role administration is Admin-only.
- Privileged and corrective actions are auditable. Never update historical/security-significant state without preserving actor, target, timestamp, reason where required, and before/after context.
- A valid database commit determines attendance success. Never display success before it commits; never retract it because a Sheets job fails afterward.

## Active zero-cost deployment constraint

Staging, the controlled pilot, and the intended production deployment must use only free-tier
services. Do not add or deploy a paid Render resource, paid database plan, paid worker, or required
payment method unless the product owner explicitly records a superseding decision.

The active deployment profile uses Free Render web services for the frontend and API, Supabase Free
PostgreSQL and private Storage, and a protected bounded job-runner endpoint called by a free
scheduled workflow with an Administrator fallback. The PostgreSQL queue and standalone worker
implementation remain in the repository for reversibility, but a separate Render worker is not
part of the active Blueprint. See [`docs/zero-cost-architecture-migration.md`](docs/zero-cost-architecture-migration.md)
for the paid/free mapping and provider-switch procedure.

## Roles and Authorization

Use deny-by-default, server-enforced authorization on every protected operation and object. UI visibility is not authorization.

- **Participant:** register/login, manage permitted profile fields, view own history, submit own attendance, and request a device replacement.
- **Course Representative:** all participant capabilities plus current-session operation, live attendance, manual verification, and participant device-change processing. A Course Representative may extend an open session within policy but can never reopen a closed one.
- **Administrator / Facilitator:** operational fallback plus Course Representative/admin assignment, protected configuration, full audit/sync review, reconciliation, and reasoned historical corrections.

Explicitly test negative permissions, including direct API/URL access, object-ID tampering, Course Representative self-approval, role escalation, and removal of the final admin.

## Core Workflows

### Registration and authentication

- Use a shared login with no client-controlled role selector.
- Registration requires a matching unclaimed roster entry, full name, unique phone, email, password, canonical serial number, and a clear identification photo.
- Successful registration establishes the current browser/device as the active attendance device and should authenticate the participant immediately.
- Registration sends email verification asynchronously. Verification is not required for attendance but is required for self-service password recovery.
- Preserve an incoming check-in destination across login/registration.
- Password reset does not approve a new attendance device.
- Bootstrap the first admin through a secure one-time deployment/CLI process, never public registration.

### Attendance session lifecycle

- Preserve the states `DRAFT/CONFIGURING`, `SCHEDULED`, `OPEN`, `CLOSED`, and `CANCELLED`; future scheduling is part of MVP.
- Opening/scheduling requires a valid effective start and end. Backdating never manufactures check-ins.
- Close automatically at the configured end using a reliable server-side mechanism, recording `SYSTEM` as closer when applicable.
- A Course Representative may extend an open session on the same calendar day by at most two hours beyond its original end. Only an Administrator may reopen or cancel a closed session; reasoned reopening also requires a new end time. These actions are audited and preserve the same session identity and uniqueness guarantees.

### Automatic check-in

Evaluate on the server: authenticated participant, open/effective session, active device credential, duplicate state, and location result. Use an atomic transaction for the final attendance record and critical audit state. Do not call Google Sheets inside that transaction.

For geolocation:

- Treat opening the stable `/check-in` route as the explicit attendance attempt. Request a fresh high-accuracy reading only for that route's attempt, not from general home-page viewing.
- Use a correct great-circle distance calculation and consider both configured radius and browser-reported accuracy.
- Initial configurable defaults are a 200 m geofence and 150 m maximum automatic-acceptance accuracy; do not scatter these values as constants.
- Discard fixes older than 30 seconds. A reliable fix passes at distance up to 200 m, clearly rejects beyond 500 m, and is uncertain between those boundaries or whenever accuracy exceeds 150 m. No fix within 10 seconds, denied permission, unavailable, or unsupported location routes to the explicit manual-request path.
- Clearly reliable and remote readings reject automatic attendance without accusatory wording.
- Only technically uncertain readings auto-create a manual case. Denied/unavailable/no-fix and clearly remote outcomes require an explicit participant request. Never create manual cases for inactive sessions, duplicates, or unrecognized devices.

### Manual verification and device replacement

- These are deliberate, status-tracked workflows, not generic bypass buttons.
- The reviewer must see a practical-size protected identification photo, name, serial, reason/context, and attempt/request time.
- Manual attendance uses the same uniqueness constraint and is visibly stored/reported as `MANUAL` / `Manual Approval`, with approver and reason.
- Emergency manual attendance is limited to an eligible session; later historical changes are Admin-only.
- Device replacement activates the candidate credential and revokes the old one atomically. Keep device history, but never log or expose raw tokens.

### Google Sheets projection

- Maintain a `Master Register`, one `YYYY-MM-DD` tab per actual session (including a clearly marked `CANCELLED` tab), and a cross-session `Summary`.
- Never export passwords/hashes, auth/session/device/reset tokens, identification photos, exact persistent coordinates, secret keys, or raw security logs.
- Synchronize asynchronously through durable, idempotent jobs with stable record keys, backoff, jitter where supported, visible internal status, and safe retries.
- Provide Admin-only reconciliation/rebuild from the database. Manual Sheet changes never overwrite authoritative database state.
- Use roster `enrollmentEffectiveDate`: earlier sessions are explicit `N/A` and excluded from attendance percentages.

## Security and Privacy Baseline

- Follow current OWASP Top 10, OWASP ASVS, and approved-stack guidance at implementation time.
- Use HTTPS in production; secure cookie settings; appropriate CSRF, CORS, CSP, security headers, rate limits, session rotation, redirect validation, parameterized queries, and output encoding.
- Hash passwords with Argon2id. Never store or log plaintext passwords.
- Use hashed, revocable server sessions with 30-day idle and 90-day absolute expiry. Generate separate attendance-device credentials with a cryptographically secure source, use protected host-only first-party cookies, and store only one-way server-side token hashes.
- Keep credentials and service-account material out of source control, frontend bundles, logs, fixtures, screenshots, and error responses. Maintain a sanitized `.env.example` after configuration exists.
- Treat identification photos as private sensitive data. Enforce 8 MB input, 1600 px longest-edge output, JPEG quality 85, EXIF removal, randomized keys in the configured private Supabase Storage/R2 provider, Admin-only replacement approval, and few-minute authorized signed URLs.
- Never persist exact participant coordinates. Store only 25 m-rounded distance, reported accuracy, and outcome; never collect location continuously.
- Make audit history append-oriented and inaccessible for mutation by ordinary operators.
- Use least privilege for database, object storage, and Google integrations. Backups inherit production data sensitivity and retention requirements.
- Identification photos are retained until course end plus about 90 days, configurable to organizer policy. Attendance and audit records are retained indefinitely as academic records.

## UI and Accessibility Contract

Build one coherent, mobile-first product, prioritizing Android Chrome and iOS Safari while supporting current desktop browsers and viewports from about 320 px upward.

- Visual direction: clean, calm, spacious, light surfaces, subtle borders, restrained shadows/radii, and one strong blue accent (`#0B7FF5`). Inter is the preferred type reference.
- Keep one obvious primary purpose per screen. Participant check-in should feel like: scan -> brief verification -> confirmation.
- Avoid gradients, glassmorphism, neon effects, decorative dashboards, random KPI cards, excessive badges, oversized hero type, and unnecessary illustrations.
- Keep participant-critical screens free of horizontal scrolling. Convert wide admin tables to meaningful mobile cards/lists where appropriate.
- Use at least 44x44 px interactive targets, visible focus, semantic elements, programmatic labels, associated validation errors, non-color status cues, reduced-motion support, and keyboard-operable core flows. Target WCAG 2.2 AA.
- Never expose coordinates, token/JWT/database language, stack traces, or sync implementation details in participant-facing copy.
- Error states must explain what happened and the next safe action. Neutral conditions such as "not open" are not destructive errors.

## Architecture and Code Organization

Use the approved stack while maintaining clear boundaries for:

- authentication and account recovery;
- roster authorization, claims, and enrollment applicability;
- roles and authorization;
- participant registration/profile and private photos;
- identification-photo replacement requests and Admin-only decisions;
- attendance devices and replacement requests;
- session lifecycle;
- attendance attempts, geofence decisions, and final records;
- manual verification;
- audit logging;
- Google Sheets projection and durable jobs;
- protected course configuration; and
- observability, retention, and operational support.

Do not keep correctness-critical session or attendance state only in process memory. Use database constraints and transactions so multiple web processes behave correctly. Prefer typed interfaces where supported, small explicit services/modules, migrations in source control, and tunable configuration rather than repeated hard-coded business values.

## Contract-Driven Implementation

Treat the documents as a connected contract rather than independent notes:

- A new or changed screen state must be reflected in `mockup/screens.md` and, when backend-driven, in `docs/api-contract.yaml` and `docs/error-behavior.md`.
- A new domain concept or transition must update `docs/domain-model.md`, `docs/state-machines.md`, persistence/migrations, and relevant acceptance tests.
- A permission change must update `docs/permissions-matrix.md`, backend authorization tests, API security behavior, and affected mockup/frontend controls.
- A security/privacy decision must update `docs/security-rules.md`, `docs/open-decisions.md` or an ADR, and its verification evidence.
- A release requirement must be traceable to `docs/acceptance-tests.md` and the PRD section that motivates it.

`docs/api-contract.yaml` uses OpenAPI 3.1 and is preliminary until accepted at the Phase 0 gate. Once implementation begins:

- Keep the contract valid and update it in the same change as API behavior.
- Prefer stable machine-readable outcome/error codes over clients branching on message text.
- Keep public error details sanitized and action-oriented.
- Preserve required idempotency and stale-state/version semantics on sensitive commands.
- Generate or type API clients from the accepted contract where the selected toolchain supports it; do not maintain incompatible handwritten request/response types in multiple places.
- Do not expose database entities directly merely because their fields are convenient. Return role-appropriate API representations.

## Decision and Delivery Workflow

Treat every `DECIDED` item in `docs/open-decisions.md` as binding. Do not implement `DEFERRED` scope. Any change requires an explicit dated superseding decision with owner, reason, impacts, and reversal/migration approach; use an ADR for material architecture changes.

Follow `docs/general-implementation-plan.md` and build vertical, testable slices:

1. Use the approved Phase 0 foundation and policy decisions.
2. Reconcile and approve the text-first flow, then build the static clickable mockup.
3. Establish backend/database/security/test foundations.
4. Deliver the completed identity/registration/roles slice, then session/automatic attendance, then operations/manual/device workflows, then Sheets projection.
5. Build the production frontend per stable mockup/API slice rather than inventing a separate product behavior.
6. Complete hardening, browser/accessibility checks, recovery evidence, and a real-venue pilot before launch.

Mockup, domain, and API refinement may proceed in parallel and should inform one another. Production code must not copy simulated mockup state as business logic.

## Working Practices

- Inspect existing files and working-tree changes before editing. Preserve unrelated user changes.
- Keep changes scoped and reviewable. Do not mix broad refactors with a feature or fix unless required.
- Identify the relevant PRD requirement, domain invariant, API operation/outcome, mockup/frontend state, and acceptance-test scenario before implementing a vertical slice.
- Check `docs/open-decisions.md` before making stack, data-model, policy, integration, retention, or deployment assumptions.
- Name domain states and denial reasons explicitly; avoid boolean combinations that obscure policy.
- Never weaken a database, authorization, audit, privacy, or idempotency invariant merely to simplify a UI path.
- Update every affected contract in the same change when introducing or changing configuration, migrations, API behavior, screen state, background workers, setup steps, deployment requirements, or operational procedures.
- Once the toolchain exists, use its documented formatter, linter, static checker, migration workflow, and test commands. Do not claim checks passed unless they were actually run.
- Do not use production data, the production Google Sheet, real participant photos, or real secrets in development/tests.

## Testing Expectations

Every behavior change should include tests at the lowest useful level and an integration/end-to-end test when it crosses security or persistence boundaries.

Use `docs/acceptance-tests.md` scenario IDs in implementation plans, test names/descriptions, or release evidence where practical. Maintain unit, integration, API-contract, browser end-to-end, and manual/pilot coverage in proportion to the boundary being changed.

At minimum, cover:

- serial normalization and validation;
- role and object-level authorization denials;
- session transitions, automatic closure, cancellation, and audited reopening;
- geofence pass, clear reject, uncertainty, denial, poor accuracy, and timeout;
- database-enforced attendance uniqueness under concurrent/retried submission;
- registered-device mismatch, replacement, revocation, and forbidden self-approval;
- manual attendance uniqueness, attribution, reason, and safe double submission;
- private photo validation, metadata stripping, and read authorization;
- Sheets idempotent upserts, outage/backoff behavior, backlog recovery, and rebuild;
- no success before database commit and continued success when Sheets is unavailable; and
- mobile happy paths and failure/recovery paths with browser-level location mocking.

Before launch, manually validate Android Chrome, iPhone Safari, a desktop Chromium browser, narrow screens, large text/zoom, slow/intermittent networks, browser-data clearing, and real venue GPS. Tune location thresholds from venue evidence rather than convenience in local tests.

## Definition of Done

A change is complete only when:

- it satisfies the relevant PRD requirement and preserves the invariants above;
- affected domain, state, permission, API, error, mockup, decision, and acceptance-test documents agree with the implementation;
- server-side authorization and validation are present where applicable;
- schema changes include migrations and constraints;
- security-sensitive actions have useful audit coverage without secret leakage;
- loading, empty, error, retry, and mobile states are handled;
- relevant automated tests pass, along with formatting/lint/type checks supported by the project;
- new configuration and operational steps are documented with safe defaults;
- release evidence identifies unresolved accepted risks and their owner when applicable; and
- no source-of-truth, privacy, or Google Sheets synchronization boundary has been blurred.
