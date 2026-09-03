# KSA Attendance System

A mobile-first attendance product for Kora Sales Academy. A permanent public QR opens a stable check-in route; the backend records attendance only when an authenticated Participant has an approved attendance browser/device, an effective open session exists, venue proximity is acceptable, and no attendance already exists for that participant and session.

## Current status

The September 2026 product and architecture decisions are approved and reflected in the planning contracts. Phase 1's text-first and clickable mockup, Phase 2's NestJS backend foundation, Phase 3's identity/registration/roles/private-photo backend slice, Phase 4's session/automatic-attendance core, Phase 5's manual-review/device/operations slice, Phase 6's Sheets projection implementation, and the core Phase 7 production frontend are complete and locally verified.

The approved MVP stack is Next.js/TypeScript/Tailwind for `/frontend`, NestJS/TypeScript for `/backend`, PostgreSQL with Drizzle ORM, a PostgreSQL-backed worker queue, private Cloudflare R2 photo storage, Resend email, Sentry, and Render Frankfurt hosting behind one custom same-origin domain.

## Source of truth

- [Product Requirements Document](context/KSA_Attendance_System_PRD_v1.0.pdf)
- [Repository guidance](AGENTS.md)

## Planning documents

Start with the [documentation index](docs/README.md) and [general implementation plan](docs/general-implementation-plan.md). The [text-first mockup specification](mockup/screens.md) defines the UX to validate before production frontend implementation.

## Intended application areas

```text
/mockup   Text-first specification and static clickable prototype
/backend  Authoritative API, database, jobs, security, audit, and integrations
/frontend Production responsive web interface
/docs     Product-to-implementation contracts and decisions
/context  Product source material
```

Phase 8 security, privacy, reliability, accessibility, and production hardening is in progress. Local hardening checks pass; staging deployment, an explicit course-end retention input, broader browser/device evidence, production Google workbook credentials, and deployment validation remain release work. See the [approved decisions register](docs/open-decisions.md), [Phase 8 verification](docs/phase-8-verification.md), and [backend setup guide](backend/README.md).
