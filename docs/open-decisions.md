# Approved Decisions Register

## Purpose

This is the implementation-facing decision register for the KSA Attendance System. It adopts the product owner's approved September 2026 review in [`context/open-decisions_decided.md`](../context/open-decisions_decided.md). These choices are binding for the MVP unless a later dated decision explicitly supersedes one.

Statuses: `DECIDED` is approved for implementation. `DEFERRED` is intentionally outside MVP scope. Pilot-tuned values in DEC-017 and DEC-018 may change only after the Phase 9 venue pilot; record the evidence and new value rather than changing configuration silently.

| ID | Decision | Approved position | Owner | Needed by |
| --- | --- | --- | --- | --- |
| DEC-001 | Production frontend framework | DECIDED: Next.js with TypeScript and Tailwind CSS. | Engineering | Foundation |
| DEC-002 | Backend framework/runtime | DECIDED: NestJS with TypeScript, REST endpoints documented through `@nestjs/swagger`; OpenAPI is generated from the application and kept aligned with this contract. | Engineering | Foundation |
| DEC-003 | Database and ORM | DECIDED: PostgreSQL with Drizzle ORM and reviewed migrations in source control. | Engineering | Foundation |
| DEC-004 | Repository/package layout | DECIDED: `/frontend`, `/backend`, `/mockup`, `/docs`, `/context`, with shared root tooling only where useful. | Engineering | Foundation |
| DEC-005 | Authentication session design | DECIDED: Server-managed session token in a Secure, HttpOnly, host-only, SameSite=Lax cookie; only its hash is stored in PostgreSQL. Renew on use, expire after 30 days of inactivity and 90 days absolute. Require recent re-authentication for high-risk Admin actions. Hash passwords with Argon2id. Keep the attendance-device credential in a separate cookie that persists until explicitly revoked. | Security/Engineering | Auth |
| DEC-006 | Email delivery and verification | DECIDED: Resend through a dedicated sending subdomain with SPF, DKIM, and DMARC. Send through the background job system. Verification is not required for attendance; it is required for self-service password recovery. | Product/Engineering | Auth |
| DEC-007 | Registration authorization policy and roster | DECIDED: The active MVP mode is `OPEN_REGISTRATION`: anyone may create a Participant account without a roster match, but every participant must provide a unique valid `KSA-XX` serial. The approved roster model remains stored and supported as the reversible `PREAPPROVED_ROSTER` mode. When that mode is active, Admin imports a CSV roster containing serial, name, and email/phone. Entries move from `UNCLAIMED` to `CLAIMED` after matching registration; duplicate/disputed claims go to Admin; entries may be disabled or corrected without deletion. First-claim registration remains a pilot exception requiring Admin review. See [`open-registration-and-rollback.md`](open-registration-and-rollback.md). | Product Owner | Registration |
| DEC-008 | Phone uniqueness | DECIDED: Normalized participant phone numbers are unique with no exceptions. | Product Owner | Registration |
| DEC-009 | Accepted photo inputs and limits | DECIDED: 8 MB upload cap; server resizes to a maximum 1600 px longest edge, re-encodes to JPEG quality 85, and strips EXIF. | Engineering/Security | Registration |
| DEC-010 | Private object storage | DECIDED: Private Cloudflare R2 bucket. Backend validates, decodes, processes, and uploads under a randomized key. PostgreSQL stores only the key and safe metadata. Authorized reads use a presigned URL lasting only a few minutes. | Engineering | Registration |
| DEC-011 | Identification-photo replacement approval | DECIDED: Admin-only because the photo is the identity anchor for manual verification. | Product Owner | Operations |
| DEC-012 | Course timezone | DECIDED: `Africa/Lagos`, explicitly stored in `CourseConfig`. | Product Owner | Sessions |
| DEC-013 | Default session duration/time | DECIDED: Three hours by default, editable by Course Rep/Admin. Session controls display resolved local start and end clock times, not only a duration. | Product Owner | Sessions |
| DEC-014 | Scheduled future sessions | DECIDED: Include in MVP. Course Rep/Admin may configure a future start; the session stays inert until server time reaches it. | Product Owner | Sessions |
| DEC-015 | Course Rep reopen window | DECIDED: Course Rep can never reopen a closed session. Admin-only reopen requires a reason and new closing time and is audited. While still open, Course Rep may extend the end to a future time on the same calendar day, at most two hours beyond the original end; larger extensions require Admin. Warn shortly before automatic close. Use an individual correction, not reopen, for one missed participant. | Product Owner | Sessions |
| DEC-016 | Session cancellation authority | DECIDED: Course Rep may cancel only a draft, scheduled, or open session. Cancelling a closed session is Admin-only. | Product Owner | Sessions |
| DEC-017 | Geofence radius | DECIDED: Start at approximately 200 m and tune from venue-pilot evidence. | Product Owner/Operations | Pilot |
| DEC-018 | Maximum automatic GPS accuracy | DECIDED: Start at approximately 150 m and tune from venue-pilot evidence. | Product Owner/Operations | Pilot |
| DEC-019 | Ambiguous-location formula | DECIDED: No fix within 30 seconds per browser attempt, followed by one automatic retry, denied permission, unavailable, or unsupported routes to the explicit manual path, not rejection. Discard fixes older than 30 seconds. Accuracy <=150 m and distance <=200 m passes. Accuracy <=150 m and distance >500 m clearly rejects automatic attendance. Every other result is uncertain. Thresholds remain configurable. | Engineering/Product | Attendance core |
| DEC-020 | Minimal location retention | DECIDED: Never persist raw latitude/longitude. Compute distance in-request and discard coordinates. Store only distance rounded to 25 m, reported accuracy, and PASS/UNCERTAIN/REJECT outcome on `AttendanceAttempt`. | Privacy/Product | Attendance core |
| DEC-021 | Manual-case creation policy | DECIDED: Only technically `UNCERTAIN` location results auto-create a pending case. Clearly remote and permission-denied/unavailable results require the participant to tap `Request Manual Verification`. Inactive-session, duplicate-attendance, and unrecognized-device results never create a case. | Product Owner | Operations |
| DEC-022 | Manual-case expiry | DECIDED: Pending cases expire at session close plus 15 minutes. After that, only an Admin historical correction may address the attendance. | Product Owner | Operations |
| DEC-023 | Historical correction model | DECIDED: Keep the current `AttendanceRecord` plus append-oriented `AuditEvent` entries containing before/after values, actor, reason, and timestamp. Do not add a separate versioned-attendance table. | Product/Engineering | Operations |
| DEC-024 | Late-registration applicability | DECIDED: Roster entries store `enrollmentEffectiveDate`. Earlier sessions show explicit `NOT_APPLICABLE`/`N/A`, are never absent, and are excluded from the percentage denominator. | Product Owner | Reporting |
| DEC-025 | Google integration ownership | DECIDED: Dedicated least-privilege Google Cloud service account shared only onto the target Sheet. Start under the developer's project. Handoff creates a Kora-owned service account, shares the same Sheet, and swaps credentials in configuration without code changes. | Operations/Engineering | Sheets |
| DEC-026 | Cancelled session Sheet behavior | DECIDED: Keep a clearly marked `CANCELLED` tab for auditability and exclude it from Summary denominators. | Product Owner | Sheets |
| DEC-027 | Background job mechanism | DECIDED: Durable PostgreSQL-backed queue using pg-boss or Graphile Worker on the existing database; no Redis for MVP. | Engineering | Sheets |
| DEC-028 | Retry/backoff details | DECIDED: Immediate attempt, retry after seconds, then approximately 1, 5, and 15 minutes, followed by 30–60 minute intervals with jitter until success or visible Admin escalation. | Engineering/Operations | Sheets |
| DEC-029 | Photo retention | DECIDED: Course end plus approximately 90 days, configurable to organizer policy. | Product/Privacy | Hardening |
| DEC-030 | Attendance and audit retention | DECIDED: Indefinite as permanent academic records. This does not extend photo or location retention. | Product/Privacy | Hardening |
| DEC-031 | Hosting and environments | DECIDED: Render Frankfurt: separate Next.js and NestJS web services, one background worker, managed PostgreSQL, and external Cloudflare R2. One custom public domain routes `/api/*` to the backend over Render's private network or equivalent. Cookies are Secure, HttpOnly, host-only, and SameSite=Lax. | Engineering/Operations | Foundation |
| DEC-032 | Monitoring/error tracking | DECIDED: Sanitized Sentry error tracking with session replay disabled, plus Render service logs and health checks. Never send participant-sensitive data to Sentry. | Operations | Hardening |
| DEC-033 | Live attendance update method | DECIDED: Polling for MVP; consider WebSocket/SSE only if pilot evidence justifies it. | Engineering | Operations |
| DEC-034 | Course Rep count | DECIDED: Exactly one active Course Representative. | Product Owner | Foundation |
| DEC-035 | Multi-course/multi-tenant support | DEFERRED: Keep boundaries clean but do not build multi-course or enterprise tenancy in MVP. | Product Owner | Post-MVP |
| DEC-036 | Rate-limit thresholds | DECIDED: Failed login 5 per 15 minutes per account+IP; password reset 3/hour per email; registration 50/hour per IP and 5/hour per email/serial; attendance 10/minute per account; privileged Admin actions 20/minute. Use progressive delay rather than permanent lockout, generic recovery responses, idempotent duplicate attendance, `429` plus safe `Retry-After`, sanitized anomaly logs, configurable thresholds, and a temporary Admin increase for planned onboarding. | Security/Engineering | Auth |
| DEC-037 | Zero-cost deployment profile | DECIDED: Staging, the controlled pilot, and the intended production deployment must use only free-tier services. Use Free Render frontend/API web services, Supabase Free PostgreSQL/private Storage, and a protected bounded job-runner endpoint called by a free scheduled workflow with an Administrator fallback. Do not create a paid Render resource, Render database, or Render worker. Keep the standalone worker and R2 adapter as a reversible legacy profile. This supersedes the active deployment portions of DEC-010, DEC-027, and DEC-031. | Product Owner/Engineering | Deployment |

## Change control

When superseding a decision, record:

```text
Decision ID:
Status: DECIDED or DEFERRED
Date:
Decision owner:
Chosen option:
Alternatives considered:
Reason:
Security/privacy/data impact:
Affected documents/components:
Migration or reversal strategy:
Supersedes:
```

Architecture-heavy changes should also receive a dedicated ADR while retaining the final status here.
