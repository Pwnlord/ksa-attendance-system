# Open registration and roster rollback guide

## Purpose

The application now supports two registration policies:

1. **Open registration** — anyone can create a Participant account. A roster match is not required, but every participant must provide a unique valid `KSA-XX` serial number.
2. **Preapproved roster registration** — a person can create an account only when their name, contact detail, and serial number match an eligible `UNCLAIMED` roster entry.

The active policy is stored in the staging or production database in `course_config.registration_mode`. It is a database setting, not a frontend-only switch. The backend remains the authority for the rule.

## What open registration changes

- The signup page does not require an approved roster entry.
- A participant must provide a unique valid `KSA-XX` serial number.
- Email and phone remain unique account identifiers.
- Signup still requires a name, phone, email, password, serial number, and identification photo.
- Signup still grants only the `PARTICIPANT` role.
- Email verification is still sent, but it is not required before attendance.
- The registered browser/device, location checks, attendance session, rate limits, private photo storage, and audit rules are unchanged.
- Existing roster entries are retained. Open registration does not delete or automatically claim them.

## Why the roster still exists

The roster remains available for a future controlled-registration mode, planning, reporting, and a possible rollback. It is not consulted while `OPEN_REGISTRATION` is active.

## Switching back to preapproved registration

### Before switching

1. Decide which existing open-registration accounts should be allowed to attend under the roster policy.
2. Prepare roster entries for those participants with the correct serial, name, email or phone, and enrollment-effective date.
3. Check that the roster entries do not duplicate serials, email addresses, or phone numbers.
4. Understand that changing the mode blocks **new** unmatched registrations; it does not delete or automatically disable existing accounts.

### Change the setting

Use the Administrator course-configuration action to change:

```text
OPEN_REGISTRATION -> PREAPPROVED_ROSTER
```

The change must include an Admin reason and is recorded in the audit history. If the Admin UI is unavailable, use the approved deployment/database runbook for that environment; do not edit unrelated tables or delete roster history.

### After switching

- A new participant must match an eligible roster entry.
- Existing accounts remain active unless an Administrator separately disables them.
- A participant without a roster entry can still log in and use attendance because the account was created under open registration.
- Review open-registration accounts and import or reconcile the approved roster before the next attendance period.
- Test one approved registration and one unmatched registration before announcing the change.

## Switching from preapproved registration to open registration

Use the Administrator course-configuration action to change:

```text
PREAPPROVED_ROSTER -> OPEN_REGISTRATION
```

This is also audited. Existing roster entries remain in the database and can be used again if the policy is later changed back.

## Data and rollback cautions

- Do not delete roster entries to enable open registration.
- Do not delete accounts created during open registration when reverting. Review them and decide whether they should be represented in the approved roster.
- Every account created under the new open-registration flow already has a serial. The Administrator may still need to reconcile those accounts with an approved roster if strict roster control is restored.
- Attendance and audit history is retained during either switch.
- The registration mode must be changed in every environment separately: local, staging, pilot, and production.
- Code and database migrations must support both modes before changing the setting in a deployed environment.

## Quick decision table

| Goal | Setting |
| --- | --- |
| Anyone can create an account | `OPEN_REGISTRATION` |
| Only an approved list can create an account | `PREAPPROVED_ROSTER` |
| Allow current accounts to remain while stopping new unmatched signup | Switch to `PREAPPROVED_ROSTER`; review existing accounts separately |
| Return to open signup later | Switch back to `OPEN_REGISTRATION`; keep the roster data |
