# Phase 3 Verification — Identity, Registration, Roles, and Private Photos

**Status:** Implemented and locally verified on 2026-09-03.

## Implemented slice

- NestJS auth routes for registration, login, logout, current session, email verification, password recovery, and own-profile updates.
- Roster-backed participant registration with canonical `KSA-XX` serial validation, normalized email/phone/name, atomic roster claiming, and Participant-only role assignment.
- Argon2id password hashing and server-managed 30-day idle/90-day absolute sessions.
- Separate persistent attendance-device cookie; logout revokes only the login session.
- Durable PostgreSQL-backed email verification/password-reset jobs with encrypted delivery payloads and one-way token hashes in PostgreSQL.
- DB-backed login, recovery, and registration rate-limit buckets using DEC-036 thresholds.
- Private photo processing: 8 MB input cap, safe media decoding, EXIF removal, 1600 px longest edge, JPEG quality 85, randomized storage key, and memory/R2 storage adapter boundary.
- Participant photo replacement requests, Admin-only approval/rejection, version history, retention metadata, and short-lived authorized review URLs.
- Admin roster import/correction/disable routes with whole-file validation, optimistic version checks, and audit events.
- Admin Course Representative replacement, Administrator grant/revoke, immediate role checks, and final-Administrator protection.
- Global authentication/role guards, object ownership boundaries for own resources, trusted-origin enforcement for cookie-authenticated mutations, and safe error responses.

## Local evidence

The following checks passed from `backend/`:

```text
npm run db:migrate
npm run typecheck
npm run lint
npm run format:check
npm test                         # 4 suites, 8 tests
npm run build
npm run db:check
```

The API smoke run on an isolated local port verified:

- health is public and protected `/me` returns a safe `401` envelope;
- participant registration returns `201`, canonicalizes `ksa-07` to `KSA-07`, grants only Participant, creates both cookies, and queues verification work;
- the stored photo is JPEG `1600×800`, and the queued payload contains neither the password nor the plain email;
- a participant cannot read Admin roster routes;
- an Administrator can view roster entries, replace the Course Representative, and approve a photo replacement;
- a new browser can authenticate but is `UNRECOGNIZED_BROWSER` for attendance-device status;
- logout returns `204` and does not destroy the original browser's attendance-device recognition;
- cookie-authenticated profile changes without a trusted origin return `ORIGIN_NOT_ALLOWED`;
- trusted-origin profile changes succeed and create an audit event.

## Deliberate follow-up

- The Resend worker/provider call, R2 production credentials, device-replacement review, manual verification, and session/attendance workflows are later vertical slices. Phase 3 persists their required interfaces and privacy boundaries but does not claim those workflows are complete.
- Recent re-authentication for high-risk Administrator actions still needs to be connected to the frontend confirmation flow and the final API decision; the current contract requires an authenticated Administrator and a reason, while preserving the documented follow-up.
