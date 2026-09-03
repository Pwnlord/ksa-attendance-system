# Permissions Matrix

## Purpose

This document is the authorization contract for the initial single-course KSA Attendance System. Authorization is deny-by-default and enforced by the backend for every protected route and object. Frontend visibility is only a usability aid.

## Role composition

- **Participant** is the default role granted by public registration.
- **Course Representative** is an additional operational role assigned to an existing participant by an Administrator. Exactly one assignment is active at a time unless a later product decision changes this invariant.
- **Administrator** is an oversight role. An Administrator may also be a Participant, but is not automatically one.
- The system must always retain at least one active Administrator.

## Capability matrix

| Capability | Participant | Course Representative | Administrator |
| --- | --- | --- | --- |
| Register against an eligible roster entry and use shared login | Yes | Yes | Yes |
| Manage permitted own profile fields | Yes | Yes | Yes |
| Change own serial number | No | No | No; Admin may correct another account with reason |
| Request replacement of own identification photo | Yes | Yes | Yes if also a Participant |
| Approve an identification-photo replacement | No | No | Yes; reason and audit required |
| View own attendance history | Yes | Yes | Yes if also a Participant |
| Submit own automatic attendance | Yes | Yes | Yes if also a Participant |
| View another participant's private photo | No | Only for an active operational review | For legitimate administration or review |
| View live current-session attendance | No | Yes | Yes |
| Create, schedule, or open a session | No | Yes | Yes |
| Extend an open session | No | Yes; future end, same local day, at most two hours beyond original end | Yes; audited override allowed |
| Close an open session | No | Yes | Yes |
| Cancel a draft, scheduled, or open session | No | Yes, reason required | Yes, reason required |
| Cancel a closed session | No | No | Yes, reason required |
| Reopen a closed session | No | No | Yes; reason and new closing time required |
| Approve current-session manual attendance | No | Yes, except self-exception | Yes |
| Create emergency manual attendance | No | Current eligible session, except self | Yes |
| Correct historical attendance | No | No | Yes, reason and before/after audit required |
| Request own device replacement | Yes | Yes | Yes if also a Participant |
| Approve another participant's device replacement | No | Yes | Yes |
| Approve own device replacement | No | No | No self-approval; another eligible Admin must act |
| Search participants for operations | No | Yes, minimum necessary fields | Yes |
| View roster and claim/dispute status | No | No | Yes |
| Import, correct, disable, or restore roster entries | No | No | Yes, audited |
| Assign or replace Course Representative | No | No | Yes |
| Grant or revoke Administrator | No | No | Yes; final Admin cannot be removed |
| Change venue/geofence/course configuration | No | No | Yes |
| View full audit log | No | Limited operational context only | Yes |
| View Google Sheets sync health | No | Actionable current-operation warning | Yes |
| Trigger Sheets retry/reconciliation/rebuild | No | No | Yes |

## Frontend surface mapping

The frontend exposes the capabilities above through these role-protected screens. The API and backend remain the final authorization boundary.

| Role | Screens and actions |
| --- | --- |
| Participant | Home, check-in, attendance history, profile editing, device replacement request, and identification-photo replacement request |
| Course Representative | Operations overview, live attendance, session creation/scheduling/opening/closing/extension/cancellation, participant search, emergency attendance, manual-verification queue, and device-review queue |
| Administrator | All Course Representative screens plus roster import/edit/disable/restore, Course Representative and Administrator role management, course/security configuration, closed-session actions, historical attendance correction, photo-review queue, audit log, and Google Sheets administration |

Accounts with more than one role see each applicable navigation area. A screen being visible does not grant permission: protected API routes and object-level checks still decide whether an action is allowed.

## Object-level rules

Role checks alone are insufficient. The backend must also enforce ownership and current-state rules:

- Participants may read and update only their own permitted profile, device, request, and attendance resources.
- A Course Representative may access a participant photo only while processing a legitimate manual-verification or device-change case, or another explicitly authorized operational flow.
- A Course Representative cannot approve any action targeting themselves when that action would bypass attendance-device or identity controls.
- Manual attendance by a Course Representative is limited to an eligible current session. Historical changes are Administrator-only.
- A Course Representative may review current operational manual cases, but any case targeting themselves requires an Administrator.
- Only an Administrator may approve a new identification photo because it replaces the identity anchor used in manual reviews.
- Attendance records are never created for an arbitrary client-supplied user identity. The ordinary check-in subject comes from the authenticated account.
- Resource identifiers must be validated against the actor's scope to prevent object-ID tampering.
- Role changes take effect immediately. Replacing the Course Representative revokes the previous representative's operational access.

## High-risk action controls

The following actions require confirmation, a reason where indicated, and recent re-authentication where supported by the chosen authentication design:

- Granting or revoking Administrator access.
- Changing the Course Representative.
- Changing venue or security-significant course configuration.
- Extending beyond the Course Representative limit, reopening or cancelling a closed session, or historically correcting attendance.
- Replacing a protected identification photo.
- Importing or materially correcting the authorized roster.
- Triggering a destructive Sheets rebuild/reconciliation mode, if the implementation offers one.

## Required negative authorization tests

- Participant calls every Course Representative and Administrator endpoint directly.
- Participant requests another participant's profile, photo, attendance, or device resource by ID.
- Course Representative attempts to approve their own device replacement.
- Course Representative attempts a manual self-exception.
- Course Representative attempts historical correction or role management.
- Course Representative attempts to reopen/cancel a closed session or approve a photo replacement.
- Participant attempts to claim a disabled, already claimed, or nonmatching roster entry.
- Administrator attempts to remove the final active Administrator.
- Revoked Course Representative uses an old browser session to call an operational endpoint.
- Logged-out or expired sessions call protected endpoints.
