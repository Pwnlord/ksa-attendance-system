# Security and Privacy Rules

## Authority

This document operationalizes the PRD security contract. At implementation time, the approved stack must be checked against current OWASP Top 10, OWASP ASVS, NestJS, Next.js, PostgreSQL, Drizzle, Supabase Storage/R2, Resend, Sentry, Render, GitHub Actions, and Google API guidance. A framework default is not accepted blindly when it conflicts with the rules below.

Security controls must preserve the product's WCAG 2.2 AA target; authentication, rate limiting, and recovery must not introduce inaccessible core flows.

## Trust boundaries

- Browser input is untrusted, including role claims, identifiers, timestamps, location readings, filenames, media types, and return URLs.
- The permanent QR is public and contains no credential or attendance-authorizing secret.
- The application backend is the authority for authentication, authorization, current session, server time, device recognition, geofence policy, duplicate handling, and final attendance.
- PostgreSQL is the system of record; Drizzle migrations and PostgreSQL constraints implement durable invariants.
- Google Sheets is an asynchronous reporting projection.
- Identification-photo storage is a private object-storage bucket separate from public application assets. The active zero-cost profile uses Supabase Storage; the legacy paid profile may use Cloudflare R2.

## Authentication

- Hash passwords with Argon2id. Never store, encrypt for recovery, return, or log plaintext passwords.
- Authentication uses a random server-managed token in a host-only `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` cookie. Store only its one-way hash in PostgreSQL.
- Renew an active session on use, expire it after 30 days of inactivity, and enforce a 90-day absolute maximum.
- Rotate or invalidate sessions after password reset, high-risk role changes, and suspected compromise.
- The attendance-device credential uses a separate host-only protected cookie and persists until device-replacement approval or an account-security action revokes it; logout revokes only the login session.
- Registration queues a Resend verification email but unverified email does not block attendance. Only verified email may be used for self-service password recovery, which never approves a new attendance device.
- Forgot-password responses should minimize account-existence disclosure.
- The first Administrator is provisioned through a secure one-time deployment or CLI process, never public registration.
- High-risk Administrator actions should require recent re-authentication.

## Authorization

- Deny by default on every protected backend route.
- Enforce both role and object-level ownership/scope checks.
- Never accept a client-controlled role selector or trust role data from the frontend.
- Prevent object-ID tampering for photos, profiles, attendance, attempts, devices, requests, and audit data.
- Re-check current authorization for every request so role revocation takes effect immediately.
- Course Representatives cannot approve their own device replacement or manual attendance exception.
- Role-management and full audit access are Administrator-only.
- The final Administrator cannot be removed.

## Attendance and device credentials

- Authentication and attendance-device recognition are separate controls.
- Generate device credentials with a cryptographically secure random source.
- Use a protected host-only first-party persistent cookie for the raw browser credential, separate from the authentication cookie.
- Store only a one-way token hash or equivalent protected server-side reference where practical.
- Never log, export, place in URLs, or return raw device credentials in API bodies.
- Do not automatically rebind a recognized device when a different participant logs in.
- A browser already carrying a device credential for one participant cannot register another participant account or log into a different participant account. The backend returns `BROWSER_ASSIGNED_TO_OTHER_ACCOUNT` before creating the account or login session.
- Device replacement must atomically revoke the previous credential and activate the candidate.
- Attendance inserts are protected by a database uniqueness constraint and safe duplicate handling.
- State-changing operations must be idempotent or safely reject/replay based on current state.
- Server receipt/transaction time, not the device clock, controls attendance validity.

## Web and API controls

- Validate and normalize every input on the server.
- Use parameterized queries or a correctly configured ORM; never concatenate untrusted SQL.
- Encode untrusted output and rely on safe framework rendering. Sanitize rich content if introduced.
- Protect cookie-authenticated state changes against CSRF using the chosen framework's recommended token and/or origin strategy.
- Validate allowed origins narrowly when CORS is required; wildcard credential origins are prohibited.
- Production uses one public origin at the browser: the Next.js service proxies `/api/*` to NestJS. In the zero-cost profile the server-side proxy uses the API's public HTTPS URL because Free Render services cannot use private service networking. Do not expose raw cross-site authentication to users.
- Validate return URLs to prevent open redirects.
- Apply a restrictive Content Security Policy where practical, plus appropriate `X-Content-Type-Options`, `Referrer-Policy`, framing, and `Permissions-Policy` controls.
- Rate-limit failed login to 5 per 15 minutes per account+IP, password reset to 3/hour per normalized email, registration to 50/hour per IP and 5/hour per email/serial, attendance submission to 10/minute per account, and privileged Admin actions to 20/minute. Count failed attempts where specified, use progressive delay rather than permanent account lockout, and make values configurable.
- Return generic password-recovery responses and `429` with a safe `Retry-After`. An Administrator may temporarily raise the registration threshold for planned group onboarding; the change is time-bounded and audited.
- Do not expose stack traces, SQL errors, internal paths, secrets, or implementation terminology in public errors.

## Identification-photo controls

- Validate actual media content, dimensions, and size rather than trusting extension or browser media type.
- Reject uploads over 8 MB. Decode with resource limits, preserve orientation, resize without upscaling to at most 1600 px on the longest edge, re-encode to sRGB JPEG quality 85, and strip EXIF metadata.
- Use randomized private storage keys; never derive a storage path directly from the original filename.
- Store processed photos under randomized keys in the configured private bucket; PostgreSQL stores only the key and safe metadata. The zero-cost profile uses Supabase Storage; a later provider switch requires copying objects while preserving keys.
- Authorize every photo read and issue a presigned URL lasting only a few minutes for a legitimate review workflow.
- Identification-photo replacement approval is Administrator-only; candidate and superseded versions remain private and auditable.
- Do not expose photos to other participants or Google Sheets.
- Do not use automated facial recognition without a new explicit product and privacy decision.
- Apply configurable deletion at course end plus approximately 90 days, unless a later approved organizer policy changes the period.

## Location privacy

- Request location only during an explicit attendance attempt.
- Never collect location continuously or in the background.
- Never persist raw latitude/longitude. Compute distance in the attendance request and discard coordinates immediately.
- Persist only distance rounded to the nearest 25 m, the browser-reported accuracy value, and the PASS/UNCERTAIN/REJECT result on the attempt.
- Never export exact coordinates to Google Sheets.

## Audit and logging

- Audit events are append-oriented and inaccessible for ordinary mutation.
- Record actor, role context, target, action, server timestamp, reason where required, and before/after values for corrections/configuration.
- Application logs use request/correlation IDs and structured, sanitized metadata.
- Never log passwords, password hashes, raw auth/session/device/reset tokens, service-account material, full sensitive request bodies, or unnecessary exact GPS traces.
- Security monitoring may flag repeated login failures, blocked attendance, or device changes, but automated participant accusations are prohibited.
- Send sanitized exceptions to Sentry and operational logs to Render. Disable Sentry session replay and strip participant names, serials, emails, phones, photos, coordinates, cookies, authorization headers, request bodies, signed URLs, and secrets before telemetry leaves the service.
- Operations owns production health, error, and job-backlog alerts and must maintain a documented escalation contact. In the zero-cost profile, the scheduler endpoint and its manual Administrator fallback are part of this operational responsibility.

## Secrets and third parties

- Keep database credentials, signing keys, storage credentials, Google service-account material, and API secrets out of source control, frontend bundles, fixtures, screenshots, and logs.
- Use environment-specific secret management and provide only sanitized configuration examples.
- Apply least privilege to the database, private storage, and Google workbook identity.
- Access the target workbook through a dedicated least-privilege Google Cloud service account shared only onto that Sheet. Credentials are environment configuration so ownership can move from the developer project to Kora's project without code changes.
- Send transactional email through Resend on a dedicated sending subdomain configured with SPF, DKIM, and DMARC. Email work is queued and provider failure never affects committed attendance.
- Log third-party failures without credentials or sensitive payloads.
- Rotate compromised credentials promptly and document the recovery process.

## Data lifecycle and recovery

- Backups inherit production access control and retention requirements.
- Test restoration periodically using non-production procedures.
- Provide a controlled process for personal-data correction and legitimate deletion requests subject to the decision that attendance and audit data are indefinite academic records.
- Delete identification photos at course end plus approximately 90 days unless organizer policy configures a different approved period. Attendance and audit records remain indefinitely; raw coordinates never enter storage.
- Retention jobs must be observable, retryable, and audited when they materially alter protected data.

## Security release gate

Production use is blocked until:

- HTTPS, secure cookies, CSRF/origin behavior, CORS, and security headers are verified in the production-like environment.
- Negative authorization and object-access tests pass.
- Photo upload, metadata stripping, private access, and retention behavior are tested.
- Rate limits and safe error responses are verified.
- Secrets scanning/configuration review finds no real credentials in source or client assets.
- Database uniqueness, transactional device replacement, and no-success-before-commit behavior are proven.
- Google Sheets outage and replay cannot lose or duplicate authoritative attendance.
- Sentry filtering, disabled replay, Render health checks, scheduled-job/backlog visibility, and alert ownership are verified without participant-sensitive telemetry. The one-shot runner accepts only a backend secret and returns no job payloads.
