# Text-First Mockup Specification

## Purpose

This document defines the content and behavior to validate before building the production frontend. It describes what each role sees, what they can attempt, and how the interface moves between states. Backend rules remain authoritative; [`index.html`](index.html) simulates these states using fictional fixtures only.

## Product-wide interaction rules

- Mobile-first from 320 px upward, prioritizing Android Chrome and iPhone Safari.
- Target WCAG 2.2 AA for core flows where applicable.
- One clear primary purpose and primary action per screen.
- Shared visual language for Participant, Course Representative, and Administrator.
- No role selector on login and no client-controlled privilege choice.
- Status uses icon plus text, never color alone.
- Minimum interactive target 44 by 44 px; major mobile actions approximately 48 px high.
- No participant-facing coordinates, GPS threshold, token, JWT, database, or Google sync implementation language.
- Every asynchronous screen defines loading, success, empty, error, and safe retry behavior.
- Preserve the `/check-in` intent through login and registration.

## Visual direction

- Page background `#F8FAFC`, white surfaces, pale blue `#F2F8FD`, primary blue `#0B7FF5`.
- Main text `#101828`; secondary text `#667085`; subtle borders `#E4E7EC`.
- Success `#17A673`, warning `#F79009`, error `#D92D20`, each with text/icon context.
- Inter or a comparable modern sans-serif.
- Restrained rounding, subtle borders, little or no shadow, generous whitespace.
- Avoid gradients, glass effects, decorative illustrations, random KPI cards, oversized type, and excessive badges.

## Navigation model

### Participant mobile

Bottom navigation:

- Home
- Attendance
- History
- Profile

### Course Rep/Admin desktop

Top navigation:

- Overview
- Attendance
- Participants
- History
- Administration, Administrator only
- Profile/avatar

### Course Rep/Admin mobile

Use a compact bottom navigation or simple menu. Prioritize Overview, Attendance, Queues, and More. Never compress desktop labels into an unreadable row.

## Shared authentication screens

### M-01 Shared login

**Route:** `/login`

**Purpose:** Authenticate any account without asking the user to select a role.

**Content:**

- Product name and concise welcome text.
- Email or serial-number field.
- Password field with show/hide control.
- `Log in` primary button.
- `Forgot password?` and `Create account` links.
- Safe generic invalid-credentials message.

**States:** default, submitting, invalid credentials, rate limited, temporary service error.

**Transitions:**

- Success with preserved check-in intent → M-08 Attendance context/processing.
- Ordinary success → role-appropriate home/dashboard.
- Create account → M-02 Registration.
- Forgot password → M-05 Password recovery.

### M-02 Registration

**Route:** `/register`

**Purpose:** Create a Participant account and establish the current browser as the attendance device.

**Content:**

- Full name, phone, email, password, serial number, and identification-photo upload.
- Explain that registration must match an approved roster entry and route mismatches/disputes to Administrator support without exposing roster data.
- Serial example `KSA-07` and live prefix normalization.
- Photo guidance: recent, clear, recognizable face; maximum 8 MB. The production backend will resize and safely process it.
- Device notice: this browser becomes the approved attendance device; avoid private mode; clearing data or changing browsers may require approval.
- Concise privacy notice covering identity photo and attendance-time location use.
- `Create account` primary action and `Already have an account? Log in` link.

**States:** empty, partially complete, field errors, photo preview, photo processing, roster mismatch/disabled/already claimed, duplicate identity, rate limited, submitting, temporary failure.

**Validation copy examples:**

- `Serial number must follow KSA-XX, for example KSA-07.`
- `That email or serial number is already registered. Log in or contact support if this is unexpected.`
- `We couldn't match these details to an available class registration. Check them or contact the Administrator.`

**Transitions:** successful registration → M-03 Registration success; preserved check-in intent continues after confirmation.

### M-03 Registration success

**Route:** `/registration/success`

**Content:** success icon and text, participant name, canonical serial, explanation that this browser is registered, warning about site-data/browser changes, notice that a verification email has been sent, and `Continue`. Clearly state that email verification does not delay attendance.

**Transitions:** preserved check-in → M-08; otherwise → M-06 Participant home.

### M-04 Email verification status

Show `Unverified`, `Verification sent`, `Verified`, expired-link, and resend states. Explain that verification is not required for attendance but is required for self-service password recovery. Resend safely without exposing unrelated accounts and rate-limit repeated requests.

### M-05 Password recovery

Email/recovery identifier, generic accepted response, reset-password form, success, expired/invalid token, and safe retry. The response never reveals whether the account or verified email exists. Password reset is available only through verified email and explicitly does not approve the current browser for attendance.

## Participant screens

### M-06 Participant home

**Route:** `/home`

**Purpose:** Answer “What is my attendance status today?” immediately.

**Content order:**

1. Welcome name and serial.
2. Today's Attendance feature card above the fold.
3. Current registered-device status if attention is required.
4. Recent attendance history.
5. Participant navigation.

**Today's card variants:**

- Not open: neutral; `Attendance is not currently open.`
- Open and not present: primary `Check in` action.
- Already present: success state with original time.
- Closed: neutral ended state.
- Device action required: warning and replacement action.

### M-07 Attendance entry/context

**Route:** `/check-in` and `/attendance`

**Purpose:** Stable QR destination and automatic attendance entry.

**Behavior:**

- Logged out → M-01 while preserving this route; successful login automatically resumes the attendance attempt.
- Not registered → offer M-01 and M-02.
- Session not open/closed → M-10.
- Already present → M-09 success variant.
- Device mismatch → M-12.
- Eligible → immediately continue to M-08. There is no additional `Check in` button on the QR destination; the browser's own location-permission prompt is the required consent step.

### M-08 Attendance processing

**Purpose:** Focused temporary state while automatic checks occur.

**Content:** spinner or restrained skeleton, `Verifying attendance…`, `This should only take a moment.` The screen may briefly say `Requesting your location…` while the browser permission prompt is active. No checklist of security internals.

**Transitions:** success → M-09; not open/closed → M-10; location issue → M-11; device mismatch → M-12; pre-commit service failure → M-15.

### M-09 Attendance success/already present

**Content:**

- Success icon and `You're present` or `You're already checked in`.
- Participant name and serial.
- Attendance date and server-recorded local time.
- `You can close this page.`
- Optional link to attendance history.

Google Sheets status is never shown as part of participant success.

### M-10 Attendance not open/closed

Neutral information screen with one of:

- `Attendance is not currently open.`
- `Today's attendance session has ended.`

Provide `Back to home`. Do not use destructive red styling.

### M-11 Location failure or uncertainty

**Variants:** permission denied, timed out, unavailable/unsupported, poor/ambiguous accuracy, and clearly remote.

**Content:** simple explanation, `Try again`, optional settings guidance, and `If you are physically present, see the Course Representative.` Poor/ambiguous results automatically create one pending case and expose `Check approval status`. Permission denied, timeout/no-fix, unavailable, unsupported, and clearly remote results show an explicit `Request Manual Verification` action instead; no case exists until the participant taps it.

**Clearly remote variant:** `Attendance can only be recorded at the venue.` Do not accuse the participant of dishonesty. If the participant says they are physically present, the manual request requires a short explanation.

### M-12 Device mismatch

Explain that the account remains usable but this browser is not the approved attendance device. Primary action `Request device change`; secondary action back to home/profile.

### M-13 Device-change request status

**States:** request ready, pending, approved, rejected, superseded/error.

Pending content includes participant serial and instruction to physically see the Course Representative or Administrator. Approved content offers `Continue attendance` when a session remains eligible.

### M-14 Personal attendance history

Date list showing present/absent/not applicable as policy allows, method where useful, and session status. Cancelled sessions are clearly marked or omitted from percentages. No other participant data is visible.

### M-15 Participant retryable service error

Explain that attendance has not yet been confirmed, provide a safe `Try again`, and never show a success icon. Include a short support reference derived from correlation ID when appropriate.

### M-16 Profile

Own name, unique phone, email and verification status, immutable serial display, password-change link, identification-photo status, `Request photo replacement`, attendance-device status, request-device-change action, and attendance-history link. A candidate photo remains inactive until Admin approval. Security-significant changes trigger recent re-authentication/verification according to policy.

## Course Representative screens

### M-20 Dashboard — attendance closed

**Route:** `/operations`

**Primary status:** `Attendance Closed`.

**Content:** today's date/context, `Open attendance`, start defaulting to now, end defaulting to three hours later, resolved local clock range, `Schedule attendance`, pending manual/device counts, recent sessions, registered participant count, and actionable sync warning only if appropriate.

### M-21 Open attendance dialog/page

Date, local start, local end defaulting to a three-hour window, explicit `Africa/Lagos` context, resolved clock range such as `10:00 AM – 1:00 PM`, validation that end follows start, and clear confirmation. Primary action is `Open attendance` for a current start or `Schedule attendance` for a future start; secondary action is `Cancel`.

States include submitting, stale state, another session already active, validation error, and success.

### M-22 Dashboard — attendance open

**Primary status:** `Attendance Open` with resolved effective local start/end times.

**Content order:** live present count, `View attendance`, `Extend end time`, `Close attendance`, manual queue count, device-change queue count, recent activity, and actionable sync warning. Show a prominent warning shortly before automatic closure.

### M-23 Close/extend/cancel confirmation

- Close: confirm effect on new check-ins.
- Extend: show original and proposed local end times. For Course Rep, require a future end on the same day and no more than two hours beyond the original end; explain when Admin is required.
- Cancel: mandatory reason and denominator warning. Course Rep may cancel only draft, scheduled, or open sessions.

### M-24 Live attendance

Count, search, participant name/serial, check-in time, and method. Desktop uses a lightweight table; mobile uses stacked rows/cards. Provide manual refresh plus modest polling in production; no WebSocket/SSE is required for MVP.

### M-25 Manual-verification queue

Pending cases prioritized, showing name, serial, creation source, reason, attempt time, expiry time, and status. The dashboard badge and queue poll during an active session and remain persistent if a temporary toast is missed. Empty state: `No manual verifications are waiting.`

### M-26 Manual-verification detail

**Content order:**

1. `Manual verification` heading.
2. Large protected identification photo.
3. Name and serial.
4. Reason, attempted time, and `Review before` expiry time.
5. `Approve attendance` primary action.
6. `Reject` secondary action.

Decision confirmation prevents accidental taps. Emergency flow requires a reason. Forbidden self-approval displays a clear policy message and directs the Course Rep to an Administrator. At session close plus 15 minutes, an unresolved case displays `Expired` and directs the operator to Admin historical correction.

### M-27 Device-change queue

List pending requests with participant identity summary and request time. Empty, loading, stale, and error states are required.

### M-28 Device-change detail

Large protected photo, name, serial, request time/context, explanation that approval revokes the previous device, and Approve/Reject actions. Course Rep self-request is disabled with Administrator guidance.

### M-29 Participant operational search

Search by name/serial/email, with minimum necessary result fields. Actions depend on current role and session. Avoid showing private photos in the list view.

### M-30 Session history/detail

Session date/status, original/current start and end, open/close actors, present count, manual method visibility, extension/cancellation/reopen context, and drill-down. Course Rep never sees a reopen action for a closed session.

## Administrator screens

### M-40 Admin overview

Uses the same operational dashboard shell as Course Rep, plus Administration links for roles, configuration, audit, historical correction, and Sheets health. Avoid decorative KPI tiles.

### M-41 Role management

Current Course Rep with replace action and participant search; active Administrators with grant/revoke actions. Grant/revoke requires confirmation and recent re-authentication. Final-Administrator removal is blocked with a clear explanation.

### M-42 Venue and course configuration

Course label, fixed/default timezone `Africa/Lagos`, venue coordinates, 200 m starting radius, 150 m maximum automatic accuracy, 500 m clearly-remote boundary, 30-second reading freshness, 10-second acquisition timeout, three-hour default session duration, manual-case 15-minute grace period, photo retention, and rate-limit settings. Show units and explanatory help. Values remain configurable for evidence-based pilot tuning. Save requires confirmation/reason and exposes no secret values.

### M-43 Audit log

Filter by action, date, actor, and target participant/session. Use readable event descriptions with actor, target, time, reason, and before/after detail where authorized. Never show raw tokens, secrets, or full GPS traces.

### M-44 Historical attendance correction

Select session and participant, show current authoritative state, choose corrected outcome, enter mandatory reason, review before/after summary, and confirm. Completion links to the audit event.

### M-45 Google Sheets health

Status, pending/failed counts, last successful sync, sanitized actionable error, Retry, and Reconcile/Rebuild controls. Explain that database attendance remains authoritative. Reconciliation requires scope, reason, and confirmation. Cancelled sessions retain a clearly marked `CANCELLED` tab, and pre-enrollment Summary cells show `N/A`.

### M-46 Authorized roster

Admin-only CSV import, validation preview, import result, and roster list. Show canonical serial, expected participant details, enrollment effective date, `Unclaimed`/`Claimed`/`Disabled` status, and safe dispute context. Import errors identify invalid rows before commit. Correct, disable, restore, and resolve-dispute actions require confirmation and an audit reason; history is never erased.

### M-47 Identification-photo replacement queue/detail

Admin-only queue with pending candidate photos. Detail shows the current and safely processed candidate photo, participant name/serial, request time/note, and the effect of approval. Approve/Reject requires confirmation and a reason. Approval activates the candidate while preserving version/audit history; Course Rep has no approval control.

### M-48 Closed-session administration

Admin-only controls for reopening or cancelling a closed session. Reopen requires a reason and new future closing time and explains that the same session/attendance records remain. Cancel requires a reason and explains the `CANCELLED` tab and denominator effect. For one missed participant, direct the Administrator to M-44 instead of reopening.

### M-49 System operations

Render/API/worker/database health summary, PostgreSQL queue backlog, failed jobs, retry controls, and last successful job timestamps. Show only sanitized errors and support references. Sentry is an operator integration, not embedded participant telemetry; session replay is absent.

## Prototype state controls

The clickable mockup should include a reviewer-only state panel or scenario selector, excluded from production designs, with fixtures for:

- Logged out / Participant / Course Rep / Administrator.
- QR route opened while logged out, then automatic resume after login.
- Session missing / scheduled / open / closed / cancelled.
- Registered / unrecognized attendance browser.
- Location pass / uncertain / denied / timeout / clearly remote.
- No attendance / already present.
- Manual case absent / auto-created uncertain / explicit request / pending / approved / rejected / expired.
- Device request pending / approved / rejected / self-approval forbidden.
- Roster unclaimed / claimed / disabled / disputed and CSV import validation.
- Photo replacement pending / approved / rejected / Course Rep forbidden.
- Sheets healthy / backlog / failed.
- Scheduled session inert / open nearing close / extended / Admin-only reopen.
- Empty, loading, validation, stale-state, rate-limit, and temporary-service errors.

## Responsive review checklist

- Participant-critical content is visible without horizontal scrolling at 320 px.
- Primary attendance state appears above the fold on common mobile heights.
- Forms are single-column on mobile.
- Admin tables transform into meaningful cards/lists or controlled scrolling.
- Long names and larger text do not clip controls.
- Bottom navigation does not cover content or actions.
- Dialogs become safe full-height sheets/pages where mobile space requires it.

## Accessibility review checklist

- One logical page heading and semantic section hierarchy.
- Programmatic form labels and associated errors.
- Visible focus, keyboard order, and no keyboard traps.
- Status changes announced through accessible live regions in production.
- Icon-only controls have accessible names.
- Touch targets meet minimum size.
- Contrast remains sufficient for meaningful text and controls.
- Reduced-motion preference is respected.

## Mockup approval gate

The text-first and clickable mockup are approved when stakeholders can walk through the core acceptance scenarios without unresolved navigation, copy, role, state, or mobile-layout questions. Approval validates intended behavior; it does not waive backend authorization, security, or data-integrity requirements.
