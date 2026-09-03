# Acceptance Test Specification

## Purpose

These scenarios are the minimum executable evidence required before MVP release. Detailed tests may expand them, but implementations must not remove the security, data-integrity, privacy, accessibility, or recovery assertions.

## Test layers

- **Unit:** normalization, geofence decisions, permission policies, transition guards, retry calculations, and pure reporting rules.
- **Integration:** real test database transactions, uniqueness, authentication, device replacement, manual approval, audit, private-photo authorization, and job persistence.
- **Contract:** production frontend expectations against the OpenAPI response/outcome shapes.
- **End-to-end:** browser journeys with mocked geolocation and production-like cookies.
- **Manual/pilot:** real browsers, real venue GPS, accessibility checks, slow/intermittent networks, and operational recovery.

## Core end-to-end scenarios

### AT-001 Registration normalizes identity and binds device

Given an eligible `UNCLAIMED` roster entry and a new participant enters matching valid details and `ksa-07`, when registration succeeds, then:

- The serial is stored/displayed as `KSA-07`.
- Exactly one Participant role is granted.
- The identification photo is private and metadata-stripped.
- The processed photo is JPEG quality 85 with a longest edge no greater than 1600 px, and the original upload did not exceed 8 MB.
- The current browser becomes the one active attendance device.
- The participant is authenticated and can continue the original check-in intent.
- The roster entry is atomically marked `CLAIMED` and linked to the participant.
- Email verification is queued through the durable worker, but the unverified participant remains attendance-eligible.
- The success screen explains device persistence and replacement implications.

When `OPEN_REGISTRATION` is active, a new participant with valid details and a unique `KSA-07` serial can register without any matching roster entry. The same identity, photo, device, email-verification, and Participant-only assertions still apply.

### AT-002 Invalid or duplicate registration is safe

- Malformed serials such as `KSA-7`, `KSA-007`, `KS-24`, `KSA-A4`, and `KSA24` are rejected clearly.
- Missing, disabled, already claimed, or nonmatching roster entries cannot create an ordinary account.
- Duplicate normalized email, phone, or serial cannot create a second account.
- Public registration cannot grant Course Rep or Administrator.
- Another user's private account details are not disclosed.

### AT-003 Closed or absent session never records attendance

Given no effective open session, a QR check-in displays the correct not-open/closed state and creates no final attendance or false pending record.

### AT-004 Valid automatic check-in

Given an authenticated participant opens the stable QR route, has an active registered device, an effective open session, a fresh reliable inside-geofence location, and no prior attendance, then the automatic check-in attempt commits one `QR` attendance record with server time before success is shown; no extra in-app `Check in` action is required.

If the participant is logged out, the route sends them to login, preserves the destination, and automatically resumes the same attempt after successful login.

### AT-005 Duplicate and concurrent check-in

- A rescan returns the original record and time.
- Concurrent submissions produce exactly one database row.
- Neither client sees an internal uniqueness error.

### AT-006 New-device replacement

Given a participant logs in from another browser/device:

- Account access is allowed but attendance is blocked.
- The participant can create a candidate replacement request.
- The reviewer sees the protected photo, name, serial, reason/context, and request time.
- Approval atomically activates the candidate and revokes the old device.
- The old device fails subsequent attendance and the new device succeeds when otherwise eligible.

### AT-007 Forbidden self-approval

- Course Representative cannot approve their own device replacement.
- Course Representative cannot use emergency/manual attendance to bypass their own controls.
- An eligible Administrator can perform the required review.

### AT-008 Location uncertainty and manual verification

For poor-accuracy or ambiguous location classified as `UNCERTAIN`:

- No automatic present record is created.
- Exactly one pending manual-verification case is auto-created per participant/session.
- Participant receives retry guidance and sees pending-review status.
- Course Representative can review a pending case with the protected photo.
- Approval creates one `MANUAL` attendance with reviewer and reason/context.
- Repeated approval is safe and does not duplicate attendance.

For permission denied, unavailable, unsupported, or no fix within approximately 30 seconds plus one automatic retry, no case is auto-created; the participant receives recovery guidance and may explicitly request manual verification. A fix older than 30 seconds is discarded and replaced with a fresh request.

### AT-009 Clearly remote location

A reading with accuracy at most 150 m and distance beyond 500 m is rejected automatically, creates no attendance or automatic manual case, uses non-accusatory copy, and persists no raw coordinates. If physically present, the participant can explicitly request one deduplicated manual case.

### AT-010 Session lifecycle

- Course Rep/Admin can create a future scheduled session; it stays inert until server time reaches its start.
- A newly configured session defaults to three hours and the UI displays resolved local start/end times in `Africa/Lagos`.
- Course Rep/Admin can open a valid configured session.
- A second effective/open session is rejected.
- Session automatically closes at end time with closer `SYSTEM`.
- Later check-in is rejected.
- While open, Course Rep can extend only to a future time on the same local day and no more than two hours beyond the original end; the warning, extension, and audit behavior work.
- Course Rep cannot reopen a closed session. Admin reopen requires a reason and new closing time, keeps the same session ID, and is audited.
- Course Rep may cancel draft/scheduled/open sessions but cannot cancel a closed one; Admin may cancel a closed session with reason.

### AT-011 Cancellation and no-class behavior

- A cancelled session is excluded from Summary denominators.
- Its dated Google Sheet tab remains and is clearly marked `CANCELLED`.
- A Wednesday without a session creates no attendance tab, absence, or denominator entry.
- Cancellation preserves actor, reason, time, and prior session context.

### AT-012 Google Sheets outage and recovery

With Google unavailable after the database commit:

- Participant still receives attendance success.
- A durable pending sync state exists.
- Backoff retries do not duplicate rows.
- Retries follow the configured seconds, approximately 1m, 5m, 15m, then 30–60m-with-jitter schedule and eventually become visible to Admin.
- Admin can see backlog and last error safely.
- Reconciliation rebuilds deleted/damaged Sheet output from database state.

### AT-013 Historical correction

Only an Administrator can perform a historical correction. A reason is mandatory, current authoritative state changes, before/after values are retained in `AuditEvent` without a separate attendance-version table, audit is immutable to ordinary users, and Sheet reporting eventually reflects the correction.

### AT-014 Authorization and object access

- Participant receives no privileged data from Admin/Course Rep URLs or APIs.
- Identifier tampering cannot expose another participant's profile, photo, attendance, device, or request.
- Course Rep cannot use role-management, full audit, protected config, or historical-correction APIs.
- Removing the final Administrator is rejected transactionally.
- Revoked roles stop working immediately even from an existing session.

### AT-015 Private photo security

- Invalid media, oversized files, and deceptive extensions are rejected.
- Inputs over 8 MB are rejected. Accepted images are resized to at most 1600 px longest edge, re-encoded as JPEG quality 85, and stripped of EXIF.
- Direct public access is impossible.
- Processed objects use randomized keys in the configured private storage provider. The zero-cost profile uses Supabase Storage and the legacy paid profile uses R2. Authorized review access is scoped through a signed URL lasting only a few minutes.
- Photos and storage keys do not appear in Google Sheets or ordinary logs.

### AT-016 Failure before database commit

When the database transaction fails, the participant never sees success, no final record exists, and a safe retry can later complete without duplication.

### AT-017 Role management

- Administrator assigns a registered participant as Course Rep.
- Previous Course Rep access revokes immediately.
- Administrator grant/revoke requires confirmation and appropriate re-authentication.
- Role changes generate actor/target/before/after audit data.

### AT-018 Late registration reporting

Given a roster entry with an `enrollmentEffectiveDate`, every earlier session is displayed as `NOT_APPLICABLE`/`N/A`, is never counted absent, and is excluded from the attendance-percentage denominator. Applicable later closed sessions continue to derive Present or Absent normally.

### AT-019 Session, device-cookie, and email-verification independence

- Login uses a server-managed token cookie whose raw value is never stored in PostgreSQL.
- Ordinary use renews the session; 30 days inactivity or 90 days absolute age requires login again.
- Logging out revokes the login session but does not revoke the separate approved attendance-device credential.
- An unverified participant can attend when all attendance checks pass.
- Password recovery always gives a generic response and sends a reset only for an account with verified email.
- Password reset revokes affected login sessions and never approves the current browser as an attendance device.

### AT-020 Roster administration and photo replacement

- Admin can import a valid roster CSV and see `UNCLAIMED`, `CLAIMED`, and `DISABLED` states.
- Duplicate roster serials and malformed rows are reported without partially corrupting an import.
- Admin corrections/disables are audited and never erase claim history.
- A participant may upload a private candidate identification photo, but it remains inactive until an Administrator approves it.
- Course Rep cannot approve any identification-photo replacement.
- Approval activates the candidate, preserves version/audit history, and places superseded content under retention processing.

### AT-021 Manual-case expiry and notifications

- An auto-created or participant-requested case appears in the persistent Course Rep queue and Admin view; polling updates the visible pending count.
- Retrying does not create duplicate pending cases for the same participant/session.
- A pending case expires at session close plus 15 minutes.
- Course Rep cannot approve an expired case; only Admin historical correction can address it afterward.
- A case for the Course Rep's own attendance requires an Administrator.

### AT-022 Rate limits remain safe

- Failed login, password recovery, registration, attendance, and privileged Admin requests enforce DEC-036 thresholds and return `429` with safe `Retry-After` when exceeded.
- Successful ordinary use is not counted as failed login activity, and an attacker cannot permanently lock another account by submitting its email.
- Shared-IP registration allows the approved 50/hour while per-email/serial limits still prevent focused abuse.
- Threshold overrides for planned onboarding are time-bounded, authorized, and audited.

### AT-023 Deployment, jobs, retention, and observability

- The zero-cost deployment creates only Free Render frontend/API web services in Frankfurt, uses a Supabase Free database and private Storage bucket, and contains no Render database, paid resource, or Render worker.
- The browser sees one HTTPS application origin while Next.js proxies `/api/*` to the API's public HTTPS URL.
- Login/device cookies are Secure, HttpOnly, host-only, and SameSite=Lax; raw `onrender.com` cross-site cookies are not used.
- PostgreSQL-backed jobs survive API restarts and require no Redis. A protected one-shot endpoint processes due jobs through a free scheduled workflow, and an Administrator can trigger a bounded manual run.
- Email, Sheets, session-lifecycle, manual-case, and photo-retention jobs remain retryable when the scheduler or a provider is unavailable.
- Database migrations and exports have an explicit controlled-machine procedure because Free Render does not run the paid pre-deploy migration step.
- Google access uses a dedicated least-privilege service account and a credential swap does not require application code changes.
- Sentry receives sanitized errors with session replay disabled and no participant-sensitive fields; Render health checks/logs and scheduled-job results expose operational failure safely.
- Photo-retention work is observable and retryable; attendance/audit records remain indefinitely and raw coordinates never exist in persistence.

## Required unit coverage

- Serial trim, normalization, valid/invalid forms, and uniqueness mapping.
- Great-circle distance and boundary cases.
- Accuracy threshold and ambiguous-location classification.
- Stale-fix, 30-second acquisition with one retry, 200 m pass, 200–500 m uncertainty, poor-accuracy uncertainty, and beyond-500 m reject boundaries.
- Every permission and self-approval denial.
- Every allowed and forbidden session transition.
- Attendance duplicate conflict mapping to existing result.
- Device replacement atomicity and stale-state handling.
- Manual approval idempotency.
- Summary denominator, cancellation, and late-registration applicability.
- Sheets stable keys, retry/backoff, idempotent upsert, and reconciliation selection.
- Session idle/absolute expiry, rate-limit keys/windows, manual-case creation/expiry, and Course Rep extension bounds.

## Manual browser and accessibility matrix

Test at minimum:

- Android Chrome.
- iPhone Safari.
- Desktop Chrome or Edge.
- Current Firefox/Safari where available.
- 320 px narrow viewport, tablet, and desktop.
- Allow, deny, later-enable, timeout, and poor-accuracy location flows.
- Browser switching, site-data clearing, and private/incognito warning behavior.
- Keyboard-only operation, visible focus, semantic labels/errors, screen-reader status announcements, browser zoom/large text, and reduced motion.
- Slow and intermittent mobile networks.
- Long participant names and empty/loading/error states.

## Pilot gate

Before full launch, run a controlled venue pilot to measure real GPS accuracy on representative Android and iPhone devices. Record evidence for the chosen radius and accuracy threshold, then update configuration rather than embedding tuned values in code.

## Release evidence

The release record should link:

- Automated test results and coverage summary.
- Migration and rollback/forward-fix review.
- Security and secrets review.
- Browser/accessibility test matrix.
- Backup restoration evidence.
- Venue pilot results.
- Google Sheets outage/reconciliation evidence.
- Remaining accepted risks and responsible owner.
