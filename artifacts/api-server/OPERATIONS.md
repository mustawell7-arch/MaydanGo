# Live partner operations

## Trusted administrator setup

1. Sign in to MaydanGo using the normal Account screen.
2. A trusted workspace operator verifies that account's Clerk user ID.
3. From `artifacts/api-server`, run:
   `pnpm exec tsx scripts/provision-admin.ts user_<verified-id>`
4. Open **Account → Partner & admin tools** (`/operations`).

There is deliberately no public bootstrap endpoint or self-assigned staff role.
The script never overwrites an existing operator assignment. No accounts are
automatically made administrators, and no demo partner is promoted to live.

## Partner and inventory workflow

An administrator registers a real partner and its verified owner user ID. Each
owner account is assigned to one partner. Registration alone does not approve it.
The administrator approves the partner after the business has been verified.
Partner staff can manage only their assigned partner's dated offerings.

Create future dated offerings as drafts or publish them after partner approval.
Capacity cannot fall below active reservations. Publishing and capacity changes
are allowed only before the session starts. To change a session's date or
eligibility after creation, cancel it and create a replacement: never silently
reschedule existing reservations. Partner cancellation releases reservations and
quota without manufacturing attendance. Cancellation is terminal: cancelled
offerings cannot be edited or republished. Unpublishing hides new availability but
does not cancel existing reservations. Revoking partner approval immediately
blocks discovery and new bookings; cancel its future sessions separately when
existing reservations must be released.

Times entered without an offset in the management form are interpreted in Iraq
time. The API requires ISO timestamps with an explicit offset. Daily limits use
Iraq's UTC+3 calendar day.

## Memberships before payments

Payments are explicitly deferred at the user's request until after testing.
Paid plan definitions may be prepared, but no paid plan can be granted or
activated, and offerings requiring an extra payment cannot be booked.

Admins can grant a configured live trial once per account, or grant corporate
access after confirming the member's organization. These grants are audited and
marked `not_required`, never `paid`. Corporate access is an administrator
attestation, not a self-service corporate-code redemption flow.

Plans support shared total quota or separate physical/premium/live quotas, daily
limits, city/facility/category eligibility, facility/category/partner-group limits,
trial activity restrictions and corporate organization eligibility.
Plan changes apply to future grants; existing grants retain their server-owned
rule snapshot. Revoke an existing live membership before replacing it.
Revocation also cancels its active reservations. Sample memberships are untouched.

The future payment integration must introduce verified payment provenance,
idempotent provider webhooks, refunds and subscription lifecycle handling before
enabling a new paid source in the reservation eligibility check.

## Verification and schema setup

`pnpm --filter @workspace/db run push` applies the additive development schema.
The existing post-merge script already runs this and seeds only preview offerings.
Run `pnpm --filter @workspace/api-server run test:bookings` for database-backed
authorization, capacity, quota and scope-isolation tests. The test HTTP harness
injects identity only inside an isolated test app; the real server verifies Clerk.
