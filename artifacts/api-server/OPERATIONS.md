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

### Live event RSVPs

Partners publish events using the existing dated-offering workflow. Only future
events from approved partners that require no additional event payment appear in
member-facing catalogs. RSVP uses the same active membership eligibility,
visit quota, and daily booking limit as a regular class booking. Capacity,
duplicate reservations, and the event cancellation deadline are enforced by the
standard reservation API. Separate ticket checkout is not available; offerings
marked as requiring additional payment cannot be discovered or reserved by
members.

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

## Course recordings and private playback

Store lesson recordings in the private object directory under
`course-recordings/<filename>`. Course lessons must reference them as
`/objects/course-recordings/<filename>`; public HTTPS media URLs are rejected.
Keep the original files private and do not copy their storage URLs into member
content.

An enrolled member with a currently eligible live membership can request
playback from the published course. The API returns a one-hour playback link,
then streams the private object with range support for media players. It checks
course publication, enrollment and current membership both when issuing the link
and on every stream request, so expired links or revoked access cannot continue
playing recordings. This access path does not create or change paid membership.

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

Waitlist offers receive one reminder 10 minutes before expiry; offers shorter
than 20 minutes receive it halfway through the available window. A reminder is
claimed only for an unexpired, unaccepted offer, and push delivery records use a
per-offer/per-device deduplication key so queue retries do not send duplicates.
Reminder text uses the member's selected English, Arabic, or Sorani language
and states the remaining time. Opted-out members and members without a registered
push device do not receive the reminder.

Member state also includes the 50 most recent waitlist offer, expiry, and booking
updates. Each update is recorded in the same database transaction as its status
change and remains available when push alerts are disabled or no device is
registered. A unique per-entry event key prevents retries from creating duplicate
history. The mobile app shows the update time and class time with English, Arabic,
or Sorani labels.

### Push delivery recovery

An Expo push ticket confirms acceptance by Expo, not delivery to APNs or FCM.
The API checks receipts after 15 minutes and stores each receipt result against
its original delivery row. Receipt checks are batched, and missing receipts are
checked up to three times before being shown to support staff as unresolved.

Explicit Expo rate limits (HTTP 429 or `MessageRateExceeded`) use the same
delivery row and a bounded backoff: at most three send attempts, 30 seconds
after the first failure and two minutes after the second. A `DeviceNotRegistered`
receipt disables that device; push is turned off for the member only if no
enabled device remains. Ambiguous transport timeouts and server errors are not
retried automatically because Expo may have accepted the message already.
Support staff can review scheduled retries, permanent failures, and unresolved
receipts without seeing device tokens. Recovery updates only notification
records and device preferences; it does not change bookings, attendance, or
payment state.

Before schema sync on an environment with legacy waitlist data, the post-merge
setup backfills positions and `created_at` from legacy join times. It then copies
the old reservation link, reason, join time, and update time into
`waitlist_legacy_history`, verifies each copy, and removes the compatibility
columns in one transaction. Queue positions use existing positions first, then
legacy join time and entry ID for stable ties. The following Drizzle sync does
not auto-approve destructive changes.

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
are append-only at the database level: triggers reject updates, deletes, and
truncates while allowing new records to be inserted.

## Verification and schema setup

`pnpm --filter @workspace/db run push` applies the additive development schema.
The post-merge script also installs the audit-history triggers from migration
`0004_append_only_audit_history.sql` before seeding preview offerings. To apply
that migration manually after a schema push, run
`pnpm --filter @workspace/api-server exec tsx ../../scripts/apply-audit-history-migration.ts`.
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
protection, concurrent scans, rapid-check-in and impossible-travel rejection,
facility-hours rejection, and that a scan remains pending and ineligible until
partner confirmation. It does not exercise camera hardware, operating
system permission prompts, background/resume behavior, mobile network loss, or
real facility coordinates and GPS accuracy. Those checks require physical iOS
and Android devices and an approved facility/test reservation. Record the
device/OS, test facility, configured radius, reported GPS accuracy, and outcome
for each platform before relying on the radius operationally. Never loosen the
radius based only on simulated coordinates or use real member attendance for
testing.

## Facility map, location, and directions

Explore shows only public facilities returned by the API. Facilities without
coordinates remain available in list view and are excluded from map pins. Saved
facilities are stored in this app installation's preferences; they do not yet
sync across devices or accounts.

The app requests foreground location only after the member taps **Use my
location**. Coordinates stay in app memory for the current screen and are not
sent to MaydanGo's API. The map uses OpenStreetMap tiles; tile requests reveal
the approximate map area to that service, which the app discloses next to the
location control. Distance labels and the 5/10/25 km filters are straight-line
estimates, not walking or driving routes. Directions open Apple Maps on iOS and
Google Maps elsewhere. Review the map provider's current usage policy and
capacity before broad public launch.

## Primary mobile device security

The native app creates a random installation UUID and stores it in the operating
system's secure storage. The API stores only its SHA-256 digest. This is an
installation binding, not hardware attestation: a modified client may still
imitate client behavior, so do not describe it as proof of device integrity.
Browser-cookie website sessions are not covered by this native-app device gate.

The first native installation becomes the account's primary phone. A new
installation starts a 24-hour wait; the current primary remains usable during
that wait. When the wait ends, the first subsequent member request promotes the
new installation and rejects the old one. The app refreshes device status while
open and when it resumes. The current phone can cancel a pending change. Only
support staff or administrators may approve early, and every approval requires
a reason recorded in device history and the operations audit.

Only one change can be pending per account. A third change request within a
rolling 30-day period is flagged in the support queue, without automatically
blocking or penalizing the member. Reusing an installation secret on a different
account is rejected and recorded without storing the raw secret. A cleared
installation or reinstalled app may trigger the same 24-hour flow.

Run `pnpm --filter @workspace/api-server run test:devices` for token validation,
the exact 24-hour boundary, and repeated-change flag thresholds. These unit tests
do not replace the database-backed device-change integration tests or physical
iOS/Android checks. The new schema is additive and is applied by the existing
post-merge schema setup; do not use `push-force` to resolve unrelated schema
conflicts.
