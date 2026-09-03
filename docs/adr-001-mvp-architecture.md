# ADR-001 — MVP Application Architecture

- **Status:** Accepted
- **Date:** 2026-09-03
- **Owners:** Product Owner, Engineering, Security, and Operations according to DEC-001–DEC-036
- **Decision source:** [`context/open-decisions_decided.md`](../context/open-decisions_decided.md)

## Context

The MVP needs a mobile-first participant experience, authoritative transactional attendance, private identification photos, durable third-party synchronization, and a simple deployment footprint suitable for one Kora Sales Academy course. Authentication and attendance-device recognition must remain separate, and Google Sheets must never become the source of truth.

## Decision

- Build the production frontend with Next.js, TypeScript, and Tailwind CSS.
- Build a NestJS/TypeScript REST backend and generate OpenAPI through `@nestjs/swagger` while keeping it aligned with `api-contract.yaml`.
- Use managed PostgreSQL as the authoritative datastore, Drizzle ORM, reviewed migrations, database constraints, and transactions.
- Use hashed, revocable server-side login sessions in Secure/HttpOnly/host-only/SameSite=Lax cookies. Keep the attendance-device credential in a separate protected cookie.
- Process private identification photos in the backend and store only processed objects in a private Cloudflare R2 bucket. Authorize reads and issue few-minute presigned URLs.
- Use a PostgreSQL-backed queue through pg-boss or Graphile Worker and a separate worker process. Do not add Redis for MVP.
- Use Resend for queued transactional email and a dedicated Google Cloud service account for the target Sheet.
- Deploy separate Next.js, NestJS, worker, and managed PostgreSQL services in Render Frankfurt. Present one custom public origin and proxy `/api/*` to the backend over the private network or equivalent.
- Use sanitized Sentry error tracking with session replay disabled, together with Render logs and health checks.

## Alternatives considered

- Cross-origin frontend/API subdomains were viable but add CORS and cookie complexity.
- Raw `onrender.com` cross-site cookies were rejected because they require less reliable cross-site cookie behavior and a larger CSRF surface.
- JWTs in browser storage were rejected because revocation and token exposure are poorer fits for this application.
- Redis/BullMQ and managed queues were deferred because the MVP's job volume does not justify extra infrastructure.
- Public object URLs were rejected because identification photos are sensitive identity records.
- Personal Google OAuth was rejected as the permanent integration identity because handoff and least privilege are weaker.
- Render-only logs were rejected as insufficient for grouped application exception diagnosis; an additional standalone uptime vendor was deferred until operational evidence justifies it.

## Consequences

- Frontend and backend remain independently deployable while the browser receives first-party same-origin cookies.
- Next.js proxying must correctly forward uploads, `Set-Cookie`, request IDs, and trusted proxy headers.
- The worker and API share PostgreSQL, so queue load, connection pools, retry behavior, and database health must be monitored together.
- R2, Resend, Google, and Sentry credentials remain backend/worker secrets and never enter frontend or mockup assets.
- Third-party outages delay projection, email, or monitoring but never reverse committed attendance.
- Sentry filtering and disabled replay are release requirements because participant identity and attendance are sensitive.

## Reversal and migration

- The OpenAPI boundary allows either application framework to be replaced without changing product semantics.
- Drizzle migrations and portable PostgreSQL data permit movement to another managed PostgreSQL host.
- The storage interface and randomized object keys permit an R2 migration through a controlled object copy and key-preserving cutover.
- Google handoff creates a Kora-owned service account, shares the existing workbook, and swaps deployment credentials without code changes.
- A later move to Redis or a managed queue requires draining PostgreSQL jobs, preserving idempotency keys, and validating replay before cutover.
- A later split to frontend/API subdomains requires an explicit cookie, CORS, CSRF, and browser-compatibility review.
