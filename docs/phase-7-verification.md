# Phase 7 Verification — Production Frontend Core

## Scope

Phase 7 implements the responsive production client in `/frontend` against the accepted backend/API contract. The client is a Next.js App Router application using TypeScript and Tailwind CSS. Requests use `/api/v1` and are proxied by Next.js to the backend, preserving the approved same-origin cookie topology.

## Delivered

- Shared login, registration, password-recovery, protected-route, role-aware navigation, logout, loading, error, retry, empty, and status states.
- Participant home, attendance/history, profile, browser-device request, stable QR check-in route, location failure handling, uncertainty/manual-request flow, and duplicate/already-present states.
- Course Representative/Admin operations overview with session creation, scheduling, opening, closing, extension, cancellation, current counts, recent sessions, and links to live attendance.
- Live attendance table with name/serial search, manual refresh, and modest polling.
- Participant search with roster-minimum fields only.
- Manual-verification queue/detail/decision screens with protected-photo display, required decision reasons, confirmation, versioned decisions, and idempotency keys for approval.
- Device-change queue/detail/decision screens with protected-photo display, required reasons, confirmation, and backend-authoritative self-approval handling.
- Administrator-only Sheets health, retry, and reconciliation controls. No Sheets credential or private integration secret enters the frontend.
- Course-timezone-aware session inputs for `Africa/Lagos` and clear operator copy about the authoritative backend state.
- Responsive desktop/tablet/mobile transformations, semantic labels, visible focus styles, non-color status cues, and reduced-motion CSS support.

## Local checks

Run from `frontend/`:

```text
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

All four checks pass locally on 2026-09-03. The browser suite currently contains two Chromium smoke tests with mocked API responses and geolocation.

`npm audit --omit=dev --audit-level=moderate` reports a high-severity PostCSS advisory through the installed Next.js 15 dependency tree. npm's automatic remediation requests a breaking Next.js 16 upgrade, so it was not applied silently; this must be resolved and reverified during Phase 8 before production deployment.

## Deliberate boundaries

- The browser requests fresh geolocation only as part of the check-in flow. It does not decide whether attendance is valid.
- Role, session, server-time, registered-device, duplicate, geofence, manual-review, and attendance decisions remain backend responsibilities.
- The local backend uses the memory Sheets provider. Production Google credentials, a Kora-approved workbook, Render deployment, and live venue GPS verification are not part of this local frontend check.
- Broader browser-level E2E coverage and the full keyboard/screen-reader/performance review remain required release hardening work.

## Follow-up gate

Before production release, add Playwright or equivalent browser coverage for the acceptance journeys in `docs/acceptance-tests.md`, run the accessibility matrix on representative mobile browsers, verify the `/api/*` rewrite and secure cookies on the custom Render domain, and complete the production credential/deployment checklist.
