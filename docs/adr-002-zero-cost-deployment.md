# ADR-002 — Zero-Cost Deployment Profile

- **Status:** Accepted
- **Date:** 2026-09-03
- **Owner:** Product Owner and Engineering
- **Supersedes for the active deployment:** the paid-resource portions of DEC-010, DEC-027, and DEC-031

## Context

The project must have no paid services for staging, the controlled pilot, or the intended
production deployment. The previous Render Blueprint required a paid API, a Render-managed
PostgreSQL database, a separate paid worker, and private R2 storage. The chosen Render Free plan
does not provide all of those resource types in the required form.

## Decision

- Keep separate Free Render web services for the Next.js frontend and NestJS API.
- Use Supabase Free PostgreSQL as the authoritative database and Supabase private Storage for
  processed identification photos.
- Keep the PostgreSQL-backed durable queue and all job handlers.
- Do not create a Render background worker. Add a bounded, secret-protected one-shot job endpoint,
  call it from a free scheduled GitHub Actions workflow, and provide an Administrator-triggered
  fallback.
- Remove Render Postgres and the unsupported Render pre-deploy migration command from the active
  Blueprint. Run migrations through an explicit controlled procedure.
- Keep the standalone worker command, R2 adapter, and provider interfaces so an explicitly
  approved future paid topology can be restored without redesigning the domain or API.

## Consequences

- Email, Sheets, lifecycle, manual-case, and photo-retention jobs are eventually processed rather
  than guaranteed to run continuously or at the exact scheduled second.
- Supabase exports and restore drills become an operational responsibility because the active
  database is not Render Postgres.
- A public API URL is used by the server-side frontend proxy in the Free topology; the API must
  retain HTTPS, origin, cookie, CSRF, and authorization protections.
- Storage provider changes require copying private objects while preserving their database keys.
- Changing `DATABASE_URL` or `STORAGE_DRIVER` alone does not migrate data.
- The application remains portable: the queue, domain logic, API contract, and standalone worker
  are not tied to Supabase or GitHub Actions.

## Reversal

The least disruptive reversal is to keep Supabase and pay only for always-on compute: change the
API service plan, add a paid Render worker using `npm run start:worker`, set
`JOB_RUNNER_MODE=worker`, and stop the scheduled endpoint calls.

Returning to the original managed-Postgres/R2 layout additionally requires a verified database
export/import and a private photo copy preserving object keys before changing connection and
storage variables. The full procedure is documented in
[`zero-cost-architecture-migration.md`](zero-cost-architecture-migration.md).
