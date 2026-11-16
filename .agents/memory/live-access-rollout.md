---
name: Live access rollout
description: Payment deferral and safe operational access decisions for MaydanGo.
---
The user selected PayTabs and asked to proceed with integration preparation. Start with a separate PayTabs test profile; this merchant's live Iraq payout eligibility still needs confirmation.

**Why:** The user explicitly chose PayTabs and asked to continue setup before creating the test account.

**How to apply:** Keep test credentials and test mode separate from live credentials. Never enable live payments until this merchant's Iraq payout eligibility and recurring agreements are verified; keep sample access isolated and never represent trial or corporate grants as paid.

Existing reservations must not be silently moved to new dates or eligibility rules.

**Why:** Members committed to a specific dated offering; changing its terms without consent would invalidate the booking decision.

**How to apply:** For schedule or eligibility changes, cancel the original and create a replacement. Plan edits apply to future grants rather than rewriting existing entitlement snapshots.

Finance controls are review and status tracking only: they must not initiate bank transfers, and booking cancellation must not trigger a refund.

**Why:** The Phase 1 finance scope excludes payment-account creation, live checkout, and automatic transfers; payments and payout eligibility remain gated.

**How to apply:** Keep money movement outside finance approval endpoints. Require verified gates and separate approval before any provider refund, and preserve a manual-only payout status.

The user wants payment work left until the final task in the provided milestones.

**Why:** The user explicitly deferred payment work to the end.

**How to apply:** Continue with non-payment milestones first; do not start checkout, invoicing, or settlement work before the final stage.

Free event RSVPs consume one standard membership visit; there is no separate event-ticket payment.

**Why:** The user explicitly chose to treat each event RSVP like a normal class reservation rather than add an event fee.

**How to apply:** Use standard membership eligibility, quota, capacity, and cancellation rules for free events. Keep separately paid events out of the free RSVP flow.

Membership access settings are snapshots: event booking follows the saved `eventAccess` rule, while digital courses require explicit `digitalContentAccess: true`. Keep paid offerings blocked even if a plan allows additional payments; older membership snapshots without `eventAccess` retain their prior event behavior.

**Why:** Plan access must control bookings and course playback without silently changing existing grants or opening checkout before the final payment milestone.

**How to apply:** Enforce saved rules for every booking and course endpoint, including playback. Do not use current plan edits to rewrite existing memberships, and do not treat `additionalPaymentAllowed` as payment authorization.

Suspension keeps sign-in and support access available while blocking restricted actions. Member suspensions block new bookings, course enrollment/playback, and check-in; partner suspensions block operational actions except safety reads and incident reports. Venue suspensions require a category: administrative restrictions block new bookings but preserve existing visits; safety, suspected fraud, and closure cancel upcoming sessions/bookings, close waitlists, restore membership visit allowance, and notify affected members. Restoring access does not recreate cancelled bookings. Require a reason for every suspension and restoration and record the actor, target, and time.

**Why:** The user chose to keep sign-in available and explicitly defined different treatment for administrative versus safety, fraud, or closure suspensions.

**How to apply:** Keep restrictions reversible and separate from payment history. Treat old venue restrictions as administrative unless reviewed. Cancellation returns membership visit allowance; never initiate a provider refund automatically, and keep any cash refund under the final payment milestone and separate finance approval.
