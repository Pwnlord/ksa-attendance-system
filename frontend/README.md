# KSA Attendance Frontend

The production responsive web client for the KSA Attendance System. It uses Next.js, TypeScript, and Tailwind CSS and consumes the authoritative NestJS API through the same-origin `/api/*` rewrite.

## Local setup

```text
npm install
cp .env.example .env.local
npm run dev
```

The local frontend expects the backend at `http://localhost:3001` by default. Set `BACKEND_INTERNAL_URL` in `.env.local` when the backend runs elsewhere. Do not place API keys, Google credentials, storage credentials, or participant data in frontend environment variables. Only values safe for the server-side rewrite belong here.

## Verification

```text
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

The E2E tests start a local Next.js server and use fictional fixtures with mocked API and geolocation responses. Install the Playwright browser once with `npx playwright install chromium` when the local machine does not already have it.

## Deployment boundary

The frontend is not the authority for authentication, roles, sessions, server time, attendance devices, geofence outcomes, duplicate attendance, manual approvals, or Sheets state. It guides the user and displays backend outcomes.

Production uses a custom HTTPS origin and a server-side `BACKEND_INTERNAL_URL` pointing to the backend service. The value may be an absolute URL or a Render private `host:port` value; the Next.js rewrite normalizes the latter to HTTP for internal service traffic. The browser calls `/api/v1`; it does not receive backend credentials or third-party service secrets.
