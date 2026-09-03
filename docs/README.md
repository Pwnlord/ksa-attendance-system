# KSA Attendance System Documentation

This directory translates the [product requirements document](../context/KSA_Attendance_System_PRD_v1.0.pdf) into implementation-ready product and technical contracts. The PRD remains the source of truth. If a document here conflicts with a PRD `MUST`, the PRD wins until the conflict is resolved and documented.

The product owner's September 2026 choices in [`context/open-decisions_decided.md`](../context/open-decisions_decided.md) have been adopted into the implementation-facing contracts below.

## Document set

- [Permissions matrix](permissions-matrix.md) — role and object-level authorization rules.
- [Domain model](domain-model.md) — business concepts, relationships, invariants, and transactional boundaries.
- [State machines](state-machines.md) — allowed transitions for sessions, attendance, manual verification, devices, and synchronization.
- [API contract](api-contract.yaml) — OpenAPI implementation baseline between the production frontend and backend.
- [Security rules](security-rules.md) — mandatory security and privacy controls.
- [Error behavior](error-behavior.md) — stable error outcomes and expected user behavior.
- [Acceptance tests](acceptance-tests.md) — release scenarios derived from the PRD.
- [Approved decisions](open-decisions.md) — binding September 2026 MVP product and architecture choices, plus deferred scope.
- [MVP architecture ADR](adr-001-mvp-architecture.md) — accepted architecture, alternatives, consequences, and migration paths.
- [General implementation plan](general-implementation-plan.md) — phased implementation sequence and quality gates.
- [Backend foundation setup](../backend/README.md) — local setup, migration, health, checks, and one-time Admin bootstrap.
- [Phase 2 verification](phase-2-verification.md) — evidence from the local database, migration, bootstrap, runtime, and quality checks.
- [Phase 3 verification](phase-3-verification.md) — evidence for identity, roster registration, roles, private photos, and authorization.
- [Phase 4 verification](phase-4-verification.md) — evidence for session lifecycle, geofence evaluation, atomic check-in, and durable lifecycle jobs.
- [Phase 5 verification](phase-5-verification.md) — evidence for manual review, device replacement, expiry jobs, operational search/history, and historical correction.
- [Phase 6 verification](phase-6-verification.md) — evidence for Sheets projection, reporting rules, retry/backlog health, and reconciliation.
- [Phase 7 verification](phase-7-verification.md) — evidence for the responsive production frontend, API integration, role-aware screens, and local quality checks.
- [Phase 8 verification](phase-8-verification.md) — evidence for local security, privacy, reliability, and production-hardening work plus remaining release gates.
- [Production readiness and environment plan](production-readiness.md) — the path from local development through staging, pilot, and production launch.
- [Phase 9 release plan](phase-9-release-plan.md) — the one-gate-at-a-time sequence for staging, the controlled venue pilot, and production release.
- [Render staging Blueprint](../render.yaml) — staging-only service topology with credential values intentionally omitted.
- [Render staging setup runbook](render-staging-setup.md) — exact Render setup, external-provider inputs, checks, and safety boundaries.
- [Text-first mockup specification](../mockup/screens.md) — screen inventory, content, actions, states, and transitions.

## Working rule

These documents intentionally separate four concerns:

1. The mockup defines what each user sees and can attempt.
2. The domain model defines the business concepts and non-negotiable rules.
3. The API contract defines how the production frontend asks the backend to perform domain actions.
4. The backend remains the authority for validation, authorization, time, state transitions, and attendance decisions.

Material changes should update every affected document rather than allowing the mockup, API, and backend rules to drift apart.
