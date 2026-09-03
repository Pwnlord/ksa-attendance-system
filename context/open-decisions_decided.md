# Open Decisions Register

## Purpose

The PRD deliberately leaves implementation choices and several business policies configurable. These decisions must be resolved explicitly before the affected phase is built. Do not silently encode an answer in code.

Statuses: `OPEN`, `PROPOSED`, `DECIDED`, `DEFERRED`.

All items below were resolved in the September 2026 review pass. Pilot-tuned values (DEC-017, DEC-018) are expected to be revisited with real venue evidence at Phase 9 — log the retuned value using the template below rather than editing the row silently.

| ID | Decision | Current position | Owner | Needed by |
| --- | --- | --- | --- | --- |
| DEC-001 | Production frontend framework | DECIDED: Next.js with TypeScript and Tailwind CSS. | Engineering | Foundation |
| DEC-002 | Backend framework/runtime | DECIDED: NestJS with TypeScript, REST endpoints documented via `@nestjs/swagger` (OpenAPI generated from the app). | Engineering | Foundation |
| DEC-003 | Database and ORM | DECIDED: PostgreSQL with Drizzle ORM. | Engineering | Foundation |
| DEC-004 | Repository/package layout | DECIDED: `/frontend`, `/backend`, `/mockup`, `/docs`, `/context`, shared root tooling only where useful — as laid out in `general-implementation-plan.md`. | Engineering | Foundation |
| DEC-005 | Authentication session design | DECIDED: Server-managed session token in a Secure, HttpOnly, SameSite cookie; only a hash of the token stored in PostgreSQL; session renews on use, expires after 30 days inactivity, 90-day absolute max; recent re-authentication required for high-risk admin actions; passwords hashed with Argon2id. The attendance-device credential is a **separate** cookie from the login session, with no independent expiry of its own — it persists until revoked by a device-replacement approval or an account-security action. | Security/Engineering | Auth |
| DEC-006 | Email delivery and verification | DECIDED: Resend, via a dedicated sending subdomain with SPF/DKIM/DMARC, delivered through the background job system. Email verification is **not required for attendance** — a verification email is sent after signup, but verification is required only for self-service password recovery. | Product/Engineering | Auth |
| DEC-007 | Registration authorization policy and roster | DECIDED: The active MVP mode is `OPEN_REGISTRATION`: anyone may create a Participant account without a roster match, but every participant must provide a unique valid `KSA-XX` serial. The approved roster model remains stored and supported as the reversible `PREAPPROVED_ROSTER` mode. When that mode is active, Admin imports a CSV roster (serial, name, email/phone); entries start Unclaimed and move to Claimed on matching registration; duplicate/disputed claims route to Admin; entries can be disabled/corrected without deletion. First-claim-only registration remains a documented pilot exception only, and every claim under it requires mandatory Admin review. See `docs/open-registration-and-rollback.md`. | Product Owner | Registration |
| DEC-008 | Phone uniqueness | DECIDED: Unique, no exceptions. | Product Owner | Registration |
| DEC-009 | Accepted photo inputs and limits | DECIDED: 8MB upload cap, server-side resize to 1600px on the longest edge, re-encoded to JPEG at quality 85, EXIF stripped. | Engineering/Security | Registration |
| DEC-010 | Private object storage | DECIDED: Private Cloudflare R2 bucket. Backend validates eligibility/type/size, decodes and re-encodes, strips metadata, uploads under a randomized object key, stores only the key + metadata in PostgreSQL. Viewing requires a short-lived (few-minute) presigned URL through an authorized route. | Engineering | Registration |
| DEC-011 | Identification-photo replacement approval | DECIDED: Admin-only. Stricter than device replacement because the photo is the identity anchor for manual verification. | Product Owner | Operations |
| DEC-012 | Course timezone | DECIDED: `Africa/Lagos`, explicit in `CourseConfig`. | Product Owner | Sessions |
| DEC-013 | Default session duration/time | DECIDED: Default duration 3 hours, editable by Course Rep/Admin. The Open Attendance Dialog and Course Rep dashboard must display the resolved clock start/end time (e.g. "10:00 AM – 1:00 PM"), not a bare duration label. | Product Owner | Sessions |
| DEC-014 | Scheduled future sessions | DECIDED: Build it. Course Rep/Admin can configure a future effective start time; the session stays inert (no check-ins accepted) until that time. | Product Owner | Sessions |
| DEC-015 | Course Rep reopen window | DECIDED: Course Rep can never reopen a closed session — Admin-only, requires entering a reason and a new closing time, and is audited. While a session is still **open**, Course Rep may extend its end time instead: new end time must be in the future and within the same calendar day, capped at 2 hours beyond the original end time (anything beyond that needs Admin); every extension is audited; the system warns Course Rep shortly before automatic closure. A single missed participant is handled with an individual attendance correction (DEC-023), not a reopen. | Product Owner | Sessions |
| DEC-016 | Session cancellation authority | DECIDED: Same boundary as DEC-015 — Course Rep may cancel a session only while it is open or not yet opened. Once a session is closed, cancelling it is Admin-only. | Product Owner | Sessions |
| DEC-017 | Geofence radius | DECIDED: ~200m starting value, tuned at the venue pilot. | Product Owner/Operations | Pilot |
| DEC-018 | Maximum automatic GPS accuracy | DECIDED: ~150m starting value, tuned at the venue pilot. | Product Owner/Operations | Pilot |
| DEC-019 | Ambiguous-location formula | DECIDED: (1) No fix within ~30s per browser attempt, followed by one automatic retry, permission denied, or unsupported → not a reject; route to the manual path (CORE-06). (2) A fix older than 30s is discarded; request a fresh reading. (3) `accuracy ≤ 150m` AND `distance ≤ 200m` → PASS. (4) `accuracy ≤ 150m` AND `distance > 500m` → REJECT (clearly remote); participant may still request manual verification if physically present. (5) Anything else (poor accuracy, or distance in the 200–500m gray zone) → UNCERTAIN, never a hard reject. All thresholds configurable in `CourseConfig`. | Engineering/Product | Attendance core |
| DEC-020 | Minimal location retention | DECIDED: Raw latitude/longitude is never persisted — distance is computed in-request and discarded immediately. `AttendanceAttempt` stores only: distance rounded to the nearest 25m, the reported accuracy value, and the PASS/UNCERTAIN/REJECT outcome. No separate deletion job is needed for location data since nothing sensitive is ever written. | Privacy/Product | Attendance core |
| DEC-021 | Manual-case creation policy | DECIDED: Only a technically-UNCERTAIN location outcome auto-creates a pending manual-verification case. Clearly-remote (REJECT) and permission-denied/unavailable outcomes do **not** auto-create a case — the participant must explicitly tap "Request Manual Verification." Inactive-session, duplicate-attendance, and unrecognized-device failures never create a manual-verification case at all; each has its own distinct handling. | Product Owner | Operations |
| DEC-022 | Manual-case expiry | DECIDED: Expires at session close + 15-minute grace period. After that, only an Admin-initiated historical correction can address it. | Product Owner | Operations |
| DEC-023 | Historical correction model | DECIDED: No separate versioned-attendance table. Current `AttendanceRecord` plus `AuditLog` (before/after values, actor, reason, timestamp) is the full history — sufficient per CORE-07 without duplicating state. | Product/Engineering | Operations |
| DEC-024 | Late-registration applicability | DECIDED: Roster entries carry an `enrollment_effective_date`. Sessions before that date show an explicit **N/A** in the Summary tab — never blank, never counted as Absent, and excluded from the attendance-percentage denominator. | Product Owner | Reporting |
| DEC-025 | Google integration ownership | DECIDED: A dedicated, least-privilege Google Cloud **service account** (not personal OAuth), scoped to the target Sheet via sharing only. Starts under the developer's own Google Cloud project for now. Handoff to Kora Sales Academy's own account later is just: create a service account under their project, share the same Sheet with it, and swap the key in config — no code changes. | Operations/Engineering | Sheets |
| DEC-026 | Cancelled session Sheet behavior | DECIDED: Keep a clearly marked `CANCELLED` tab for auditability; excluded from Summary denominator. | Product Owner | Sheets |
| DEC-027 | Background job mechanism | DECIDED: DB-backed durable queue (pg-boss or graphile-worker) on the existing PostgreSQL instance. No Redis. | Engineering | Sheets |
| DEC-028 | Retry/backoff details | DECIDED: Immediate write, quick retry after a few seconds, then ~1m, 5m, 15m, then every 30–60m with jitter until success or escalation to Admin visibility. | Engineering/Operations | Sheets |
| DEC-029 | Photo retention | DECIDED: Course end + ~90 days, configurable to organizer policy. | Product/Privacy | Hardening |
| DEC-030 | Attendance and audit retention | DECIDED: Indefinite — treated as a permanent academic record, no automatic deletion. (Does not apply to photos [DEC-029] or location data [DEC-020], which stay short-lived regardless.) | Product/Privacy | Hardening |
| DEC-031 | Hosting and environments | DECIDED: Render (Frankfurt region) — separate web services for the Next.js frontend and NestJS backend, one background worker, managed PostgreSQL; Cloudflare R2 external. **Domain topology:** one public custom domain; the frontend proxies `/api/*` to the backend (Next.js `rewrites()` over Render's private network, or equivalent); cookies are Secure, HttpOnly, host-only, `SameSite=Lax`. This resolves the cross-origin cookie risk identified during review — raw `onrender.com` subdomains do not reliably share cookies with each other. | Engineering/Operations | Foundation |
| DEC-032 | Monitoring/error tracking | DECIDED: Sentry for sanitized application-error tracking (no session replay, no participant-sensitive data sent to Sentry) + Render's built-in service logs and health checks. | Operations | Hardening |
| DEC-033 | Live attendance update method | DECIDED: Simple polling first; move to WebSocket/SSE only if pilot UX data shows a real need. | Engineering | Operations |
| DEC-034 | Course Rep count | DECIDED by current PRD: exactly one active Course Rep. Changing this requires an explicit product decision. | Product Owner | Foundation |
| DEC-035 | Multi-course/multi-tenant support | DEFERRED outside MVP. Keep code boundaries clean without building enterprise tenancy. | Product Owner | Post-MVP |
| DEC-036 | Rate-limit thresholds | DECIDED: Login 5/15min (account+IP), password-reset 3/hr (email), registration 50/hr per IP and 5/hr per email/serial (shared-network-safe), attendance-submission 10/min (account), privileged admin actions 20/min. Count failed attempts only, not ordinary successful use; apply progressively longer delays instead of permanent lockout; never let an attacker lock an account just by knowing the email; password-reset returns a generic response regardless of whether the account exists; repeated attendance submissions return the existing result rather than creating duplicates or erroring; over-limit requests return `429` with a safe `Retry-After`; log rate-limit anomalies without passwords/cookies/sensitive request content; all thresholds configurable post-pilot; Admin can temporarily raise the registration limit for planned group-onboarding days. | Security/Engineering | Auth |
| DEC-037 | Zero-cost deployment profile | DECIDED: Staging, the controlled pilot, and the intended production deployment must use only free-tier services. Use Free Render frontend/API web services, Supabase Free PostgreSQL/private Storage, and a protected bounded job-runner endpoint called by a free scheduled workflow with an Administrator fallback. Do not create a paid Render resource, Render database, or Render worker. Keep the standalone worker and R2 adapter as a reversible legacy profile. This supersedes the active deployment portions of DEC-010, DEC-027, and DEC-031. | Product Owner/Engineering | Deployment |

## Decision template

When resolving an item, record:

```text
Decision ID:
Status: DECIDED
Date:
Decision owner:
Chosen option:
Alternatives considered:
Reason:
Security/privacy/data impact:
Affected documents/components:
Migration or reversal strategy:
```

Architecture-heavy decisions may be moved into dedicated ADR files while retaining a link and status here.
