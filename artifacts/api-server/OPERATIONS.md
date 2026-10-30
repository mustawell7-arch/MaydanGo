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

## Memberships and paid access

The user deferred provider connection until after app testing. The selected
provider is PayTabs' Iraq endpoint, but this business's merchant approval,
payout eligibility, and recurring agreement access still require verification.
No PayTabs credentials are stored in application code.

Paid plan prices are configured as whole-number IQD amounts on the server.
Checkout creates a PayTabs hosted page and an unlimited recurring agreement
using the plan price and duration. The client never supplies a price, provider
reference, or access state. The checkout redirect and return page never activate
access.

For development verification, use PayTabs' separate test profile and Test API
key; test cards only work with that profile. PayTabs creates a test profile at
registration. In the merchant dashboard, get the profile ID and Test API key
under **Developers → API Keys**. The test key must have Agreements enabled, and
the profile must have a secure terms URL configured. Test mode is development
only and never substitutes for live payout verification.

Before enabling live payments, the merchant's Iraq profile must be approved for
Iraq, have recurring/agreement billing enabled, allow agreements on its server
key, and have a secure terms URL configured. PayTabs callbacks must use a
public HTTPS URL. Their `Signature` header is verified as HMAC-SHA256 over the
raw request body with the server key. MaydanGo then queries the transaction
server-to-server and checks the PayTabs profile, cart reference, IQD amount,
transaction status, and agreement reference before creating paid access.
Callback deliveries are deduplicated by a hash of the signed payload. If the
provider omits or mismatches a required agreement reference, the event does not
grant access.

A verified recurring-payment failure pauses only the paid membership. Trial
and corporate grants remain `not_required`; they are never marked paid or
changed by paid refunds. Member cancellation tells PayTabs to stop future
renewals but keeps already-paid access until the verified period end. A full
refund cancels the agreement and ends paid access and future live reservations
only after the provider confirms the refund. Preview memberships and sample
reservations remain isolated and are never promoted into live paid access.

Development test checkout requires `MAYDANGO_PAYMENTS_ENABLED=true`,
`MAYDANGO_PAYTABS_TEST_MODE=true`, `MAYDANGO_PAYTABS_TEST_AGREEMENTS_VERIFIED=true`,
`PAYTABS_TEST_PROFILE_ID`, `PAYTABS_TEST_SERVER_KEY`, `PAYTABS_CALLBACK_URL`,
and `PAYTABS_RETURN_URL`. The development callback and return URLs are already
configured to the Replit dev endpoint; checkout remains disabled until test
credentials and the test-agreement flag are added.

Live checkout requires `MAYDANGO_PAYMENTS_ENABLED=true`,
`MAYDANGO_PAYOUTS_VERIFIED=true`, `MAYDANGO_PAYTABS_RECURRING_VERIFIED=true`,
`PAYTABS_PROFILE_ID`, `PAYTABS_SERVER_KEY`, `PAYTABS_CALLBACK_URL`, and
`PAYTABS_RETURN_URL`. Set live verification flags only after this merchant's
Iraq payout eligibility and recurring agreement setup are confirmed. Store keys
in Replit Secrets, not in code or logs. Callback and return URLs must be HTTPS;
the callback must be publicly reachable.

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

## Finance and administration

Finance access is assigned only from a trusted workspace shell after verifying
the staff member's Clerk user ID. From `artifacts/api-server`, run
`pnpm exec tsx scripts/provision-finance.ts user_<verified-id>`. This operation
does not replace an existing role. Administrators continue to use
`scripts/provision-admin.ts`; partners remain assigned to one approved partner.

Authorized staff can use the web finance desk at `/finance`. It lists live
memberships, bookings, customer invoices, partner/facility records, partner
invoice documents, webhook reconciliation states, attendance totals, finance
review items and audit history. Administrator-only membership grant/revoke
actions remain behind the existing live-access checks; finance staff can review
the same records but cannot perform administrator operations. Partner and
facility management remains in `/partner-portal`.

Administrators can cancel an individual future live booking with a required
reason. The API refuses cancellation after the session starts or when attendance
evidence already exists, records the action in the operations audit trail, then
rechecks the offering's waitlist. This does not issue a refund or change paid
membership access.

Refund requests are queued against a verified paid customer invoice. The person
who requested a refund cannot approve or reject it. A different authorized
reviewer must approve it, and the live payment gates must be enabled before the
existing PayTabs refund call can run. The mobile administrator refund action also
creates a review request; it no longer sends a refund directly. Failed or
pending provider results remain visible in the finance review history.

Partner invoice review is audited. Settlement views count only partner-confirmed,
eligible attendance as verified; disputed, pending and otherwise unreviewed
attendance remain on hold. Attendance counts are evidence only and do not
calculate a partner settlement amount. Payout tracking items are manual records:
they do not create a bank account or send a transfer. Approval requires live
payout eligibility and a clear attendance period for that partner. Test-mode
credentials never enable payout approval.

Finance request keys are unique and replays return the original request only to
the same requester when the action details match. Reusing a key for a different
action or actor is rejected. Finance decision events and operation audit records
are append-only through the API; no update or delete route is exposed.

## Verification and schema setup

`pnpm --filter @workspace/db run push` applies the additive development schema.
The existing post-merge script already runs this and seeds only preview offerings.
Run `pnpm --filter @workspace/api-server run test:bookings` for database-backed
authorization, capacity, quota and scope-isolation tests. The test HTTP harness
injects identity only inside an isolated test app; the real server verifies Clerk.
Run `pnpm --filter @workspace/api-server run test:checkin` for attendance eligibility
and replay protections, and `pnpm --filter @workspace/api-server run test:payments`
for checkout, paid-access lifecycle, signed webhook rejection, and idempotency
coverage. Real provider checkout and payout eligibility still require the final
PayTabs merchant connection and account verification.
Run `pnpm --filter @workspace/api-server run test:finance` for finance role
boundaries, refund and payout replay protection, independent review, disabled
payment/payout gates, and append-only review events.

## Check-in evidence and device validation

GPS is a supporting signal, not proof that a member is physically present. The
mobile app sends coordinates, reported accuracy, capture time, and the platform's
mock-location indicator; a modified or compromised client can falsify these
values. The mock-location indicator is useful for rejecting obvious mock reports,
but it is not device attestation and cannot rule out GPS spoofing. Do not treat a
successful scan as confirmed attendance or settlement eligibility. An authorized
partner staff member must independently confirm every arrival; that confirmation
remains mandatory even when GPS is fresh and inside the configured radius.

The automated `test:checkin` suite verifies server-side location rejection,
mocked/stale location rejection, QR replacement and expiry, single-use replay
protection, concurrent scans, and that a scan remains pending and ineligible
until partner confirmation. It does not exercise camera hardware, operating
system permission prompts, background/resume behavior, mobile network loss, or
real facility coordinates and GPS accuracy. Those checks require physical iOS
and Android devices and an approved facility/test reservation. Record the
device/OS, test facility, configured radius, reported GPS accuracy, and outcome
for each platform before relying on the radius operationally. Never loosen the
radius based only on simulated coordinates or use real member attendance for
testing.
