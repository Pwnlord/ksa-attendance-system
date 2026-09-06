# Error and Edge-Case Behavior

## Principles

- Tell the user what happened and the next safe action in plain language.
- Never show attendance success before the authoritative database commit.
- Never retract committed attendance because Google Sheets is unavailable.
- Treat neutral states such as "not open" as information, not destructive errors.
- Do not expose coordinates, token state, database/JWT terminology, stack traces, or third-party implementation details to participants.
- Use stable machine-readable API codes while keeping user-facing copy editable by the frontend.

## Standard API error shape

```json
{
  "error": {
    "code": "LOCATION_UNCERTAIN",
    "message": "We could not confirm your location.",
    "correlationId": "req_...",
    "details": {}
  }
}
```

`details` must contain only safe, action-relevant data. Validation errors may include field names and safe reasons. Sensitive policy thresholds, raw tokens, stack information, and exact stored coordinates are excluded.

## Core attendance outcomes

| Code/outcome | HTTP guidance | User behavior | Persistence behavior |
| --- | --- | --- | --- |
| `AUTHENTICATION_REQUIRED` | 401 | Login, then return to check-in intent | No attendance |
| `NOT_A_PARTICIPANT` | 403 | Explain account is not attendance-enabled | No attendance |
| `SESSION_NOT_OPEN` | 409 | “Attendance is not currently open.” | No attendance or pending case |
| `SESSION_CLOSED` | 409 | “Today's attendance session has ended.” | No automatic attendance |
| `DEVICE_CHANGE_REQUIRED` | 409 | Explain device is not approved; offer request flow | Record safe attempt/request context only |
| `BROWSER_ASSIGNED_TO_OTHER_ACCOUNT` | 409 | Explain that the browser is already assigned to another participant; use that account or a different browser profile | No account or login session is created |
| `ALREADY_CHECKED_IN` | 200 | Show original confirmation time | Return existing record; no duplicate |
| `LOCATION_UNCERTAIN` | 422 | Explain that review is pending; offer retry and case status | Safe attempt plus one auto-created pending manual case |
| `LOCATION_PERMISSION_DENIED` | 422 | Give settings/retry guidance and `Request Manual Verification` | Safe attempt; no case until explicitly requested |
| `LOCATION_TIMEOUT` / `LOCATION_UNAVAILABLE` / `LOCATION_UNSUPPORTED` | 422 | Offer retry and `Request Manual Verification` | Safe attempt; no case until explicitly requested |
| `CLEARLY_REMOTE` | 422 | Explain venue requirement and allow an explicit request if physically present | Rejected attempt; no case until explicitly requested |
| `ATTENDANCE_RECORDED` | 200/201 | Show “You're present” and server time | Final record committed; sync queued |
| `SERVICE_TEMPORARILY_UNAVAILABLE` | 503 | Retry safely; do not claim attendance | No false final record |
| `ORIGIN_NOT_ALLOWED` | 403 | Return to the application and retry the action | No state change |

The exact status-code choice is finalized in the API contract. Clients must primarily branch on stable `code`/outcome values, not message text.

## Operational and edge-case matrix

| Situation | Required behavior |
| --- | --- |
| Participant scans before open | Show not open; create no attendance/pending record |
| Participant scans after close | Show closed; no automatic record; Admin correction only if justified |
| Participant scans twice | Return existing record and original check-in time |
| Two requests arrive concurrently | Database permits one final row; both receive a successful logical result |
| Session closes during check-in | Server time and transactional state decide deterministically |
| Same registered browser after logout/login | Device binding remains independent of auth session |
| Login on another phone | Account access works; attendance requires device approval |
| Cookies/site data cleared | Treat as unrecognized attendance device |
| Browser changed on same phone | Treat as a new attendance-device installation |
| Private/incognito registration | Warn or discourage; missing credential later uses replacement flow |
| Same browser used for another participant | Never automatically rebind; block new participant registration and different-participant login |
| Password compromised | Password alone is insufficient for automatic attendance |
| Phone stolen | Approve candidate device and immediately revoke old credential |
| Course Rep loses device | Another Administrator must approve replacement |
| Course Rep absent | Administrator can operate the session |
| Session nearing its end | Warn Course Rep; while still open they may extend within the same day and two-hour cap |
| Session closed early accidentally | Course Rep cannot reopen; Administrator may reopen with reason and new closing time |
| No class on Wednesday | No session, absence, or denominator entry |
| Session opened by mistake | Course Rep may cancel while open; keep a marked `CANCELLED` Sheet tab and exclude from Summary |
| Participant registers late | Sessions before roster `enrollmentEffectiveDate` show `N/A`, never Absent, and do not affect percentage |
| Roster entry missing, disabled, claimed, or mismatched | In `PREAPPROVED_ROSTER`, create no account and provide safe support/dispute guidance without exposing roster details; in `OPEN_REGISTRATION`, this condition is not consulted |
| Duplicate email, phone, or serial registration | Block and provide login/support/dispute guidance |
| GPS ambiguous near venue | Classify `UNCERTAIN`, auto-create one pending case, and offer retry/status |
| GPS reliably far away | Reject automatic attendance without accusatory wording; manual case requires explicit request |
| Location denied/unavailable/no fix within 30 seconds plus one retry | Do not reject or auto-create a case; offer recovery and explicit manual request |
| Photo unavailable to reviewer | Do not silently approve; use explicit Admin/emergency policy and audit |
| Google Sheets unavailable after commit | Participant still succeeds; durable retry and Admin backlog |
| Sheet row manually removed | Database remains authoritative; reconciliation restores projection |
| Worker unavailable | Attendance persists; jobs resume; Admin sees health issue |
| Admin removes final Admin | Reject without changing role state |
| Course Rep replaced | Previous permissions revoke immediately |
| Participant changes name | Current display updates; serial remains anchor; change is traceable |
| Participant changes serial | Self-service rejected; Admin correction requires reason |
| Participant requests a replacement photo | Candidate remains private and inactive until Admin approval; version/history preserved |
| Email remains unverified | Attendance remains available; self-service password recovery remains unavailable |
| Background job repeatedly fails | Preserve business state, continue decided backoff, expose sanitized failure and Admin retry |

## Safe retry behavior

- Check-in retries return the existing attendance record once one has committed.
- Manual approval double-click returns the already-final case/attendance result.
- Repeated manual requests return the existing pending case for that participant/session.
- Device and role decisions detect stale state and return `STALE_STATE` rather than overwriting a newer decision.
- Sheets retries use stable source keys and idempotent upserts.
- Retriable errors may include a safe `retryAfterSeconds`; clients should not invent aggressive loops.

## Validation behavior

- Serial input is trimmed, prefix-normalized to uppercase, and validated as exactly `KSA-XX`.
- Duplicate email/phone/serial and roster-claim errors provide recovery/support guidance without exposing another account or roster entry.
- Session end before/equal to start returns a field-level validation error.
- A Course Representative extension is rejected when the proposed end is not future, crosses the local calendar day, or exceeds two hours beyond the original end. A closed-session reopen by a non-Admin is forbidden.
- Photo errors distinguish unsupported content, input over 8 MB, unsafe decoded dimensions, and processing failure without revealing R2 or storage internals.
- Invalid or unauthorized resource IDs should not reveal whether a protected object exists.

## Rate-limit behavior

- Failed login: 5 per 15 minutes per account+IP, using progressive delay without permanent account lockout.
- Password reset: 3 per hour per normalized email with the same generic accepted response whether the account exists or is verified.
- Registration: 50 per hour per IP and 5 per hour per normalized email or serial. A time-bounded Admin onboarding override is audited.
- Attendance: 10 per minute per account; a committed duplicate still returns its original logical success.
- Privileged Admin actions: 20 per minute per Admin account.
- Every over-limit response is `429`, includes safe `Retry-After`, and avoids exposing whether an identity exists.
