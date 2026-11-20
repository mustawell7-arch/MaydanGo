# MaydanGo — Acceptance Criteria

| Document field | Value |
|---|---|
| Version | 1.0 |
| Last updated | 20 November 2026 |
| Status | Draft for product-owner review |
| Related documents | `docs/product-requirements.md`, `docs/user-stories.md` |

These scenarios define observable behavior for product review and test design. They do not authorize payment launch, legal decisions, or integrations that have been deferred. Each requirement must be tested in the affected role and supported language.

## Member access and localization

### AC-01 — Enforce sign-in and account boundaries

**Given** a person is not signed in  
**When** they request a member-only account, booking, or course action  
**Then** the server rejects the action and returns a sign-in response  
**And** the person cannot read or change another member’s private data.

### AC-02 — Support English, Arabic, and Sorani Kurdish

**Given** a member selects English, Arabic, or Sorani Kurdish  
**When** they open a supported member-facing page or flow  
**Then** the available text uses that language  
**And** Arabic and Sorani layouts use right-to-left direction without clipping or reversing mixed-language identifiers.

### AC-03 — Use Iraq-local scheduling

**Given** a session is scheduled in Iraq  
**When** its schedule is shown or an activity-day boundary is calculated  
**Then** the displayed and calculated time uses the configured Iraq time zone  
**And** a UTC conversion does not move the session to the wrong local date.

### AC-04 — Apply recorded consent choices

**Given** a member has declined a category of marketing communication  
**When** a promotional message is prepared  
**Then** the member is excluded from that send  
**And** the saved preference and any later change are auditable.

### AC-05 — Verify guardian consent without collecting guardian details

**Given** a participant is under 18  
**When** they attend an activity requiring guardian consent  
**Then** the partner verifies consent at the venue  
**And** MaydanGo does not request or store guardian identity details.

## Discovery, memberships, and bookings

### AC-06 — Keep public discovery separate from live availability

**Given** a listing is sample, preview, draft, or unpublished  
**When** a member browses the public or member catalogue  
**Then** it is not represented as a live provider offer or confirmed booking.

### AC-07 — Enforce membership and eligibility rules on the server

**Given** a member requests a booking or course action  
**When** their account, membership, enrollment, quota, eligibility, capacity, or timing does not satisfy the applicable rule  
**Then** the server denies the action with a clear reason  
**And** the user interface cannot bypass the decision by changing a local plan selection or request payload.

### AC-08 — Prevent overlapping exclusive resource reservations

**Given** a named court or room is reserved for a time interval  
**When** another member requests the same resource for an overlapping interval  
**Then** the second reservation is rejected  
**And** non-overlapping reservations remain available when otherwise eligible.

### AC-09 — Keep attendance and booking states consistent

**Given** a booking already has a recorded attendance outcome  
**When** a cancellation is requested  
**Then** the system prevents a silent conflict  
**And** any permitted correction follows the authorized review and audit process.

### AC-10 — Process check-in with required evidence

**Given** a member has an eligible booking and is at the approved facility  
**When** they complete the configured QR and location checks  
**Then** the server verifies the code, location, membership, limits, and booking requirements before recording attendance  
**And** an invalid, expired, or out-of-range check-in is rejected or flagged.

### AC-11 — Audit manual check-in exceptions

**Given** normal check-in cannot be completed  
**When** authorized staff record a manual check-in  
**Then** the system requires the staff identity and a reason  
**And** the exception is recorded in an audit history.

### AC-12 — Handle waitlist and cancellation changes

**Given** a session is full and a member is on its waitlist  
**When** capacity becomes available or a booking is canceled  
**Then** the waitlist follows the configured order and eligibility rules  
**And** the member can review the resulting status in the app without push notifications.

## Courses, collections, and coaching

### AC-13 — Keep course lessons protected

**Given** a course is visible in a public catalogue, recommendation, or collection  
**When** a member lacks the required course membership or enrollment  
**Then** course lessons and playback remain inaccessible  
**And** discovery does not create an entitlement.

### AC-14 — Publish only complete course collections

**Given** an administrator is editing a collection  
**When** they publish it  
**Then** it contains at least two distinct published courses in an explicit order  
**And** the API rejects duplicate courses, missing courses, or unpublished courses.

### AC-15 — Preserve collection order and access boundaries

**Given** a published collection has an administrator-defined order  
**When** a member or visitor views it  
**Then** the courses appear in that order in the selected language  
**And** opening a course still uses that course’s own access checks.

### AC-16 — Hide an incomplete collection

**Given** a published collection contains a course that later becomes unpublished  
**When** the member or public catalogue is loaded  
**Then** the incomplete collection is not shown  
**And** an administrator can review and update it.

### AC-17 — Restrict instructor access to approved assignments

**Given** an instructor has requested access  
**When** an administrator has not approved the request or assigned a course or session  
**Then** the instructor cannot view that course, session, or learner information  
**And** approval grants access only to the assigned items.

### AC-18 — Keep assignment progress private

**Given** a member is tracking practice tasks for a course  
**When** they update or view completion  
**Then** their progress remains private to the member and authorized assigned staff  
**And** it is not displayed to other members.

### AC-19 — Approve non-accredited completion certificates

**Given** a learner has completed a course  
**When** the assigned instructor approves completion  
**Then** the platform may issue a completion certificate  
**And** the instructor sees only the learner name and completion information required for approval.

## Partner quality and operations

### AC-20 — Require inspection before partner approval

**Given** a partner application is under review  
**When** no required inspection has been recorded  
**Then** the application cannot be approved  
**And** the missing inspection is visible to authorized operations staff.

### AC-21 — Trigger facility quality review at configured thresholds

**Given** a facility has linked facility or safety tickets, or public reviews  
**When** three linked tickets occur within 30 days, or the average falls below 3.5 after at least 10 reviews  
**Then** a quality review is opened for authorized operations staff  
**And** unrelated or unlinked member reports are not counted as facility complaints.

### AC-22 — Apply suspension rules by reason

**Given** a venue is suspended  
**When** the suspension reason is administrative  
**Then** sign-in and existing bookings remain available while new bookings and venue actions are blocked  
**When** the reason is safety, suspected fraud, or closure  
**Then** affected upcoming bookings are canceled and customers are notified  
**And** relevant credits or payments are returned when the payment system is available.

## Privacy, safety, and administration

### AC-23 — Limit member-photo comparison to human check-in review

**Given** an authorized staff member is handling an active check-in  
**When** they view a member photo for a visual comparison  
**Then** the comparison is manual and limited to the check-in purpose  
**And** no automated face matching or biometric template is created.

### AC-24 — Escalate unassigned urgent reports

**Given** an urgent report remains unassigned  
**When** 30 minutes have elapsed  
**Then** the escalation is triggered and the outcome is recorded  
**And** the platform does not claim that email or SMS was sent unless that delivery route is connected and verified.

### AC-25 — Restrict role-specific administration

**Given** a staff account has a specific operational role  
**When** it requests an action outside that role’s permission  
**Then** the server denies the action  
**And** ordinary administrators cannot edit or delete finance audit history or gain unrestricted access to banking information.

### AC-26 — Apply retention defaults

**Given** guardian-consent evidence or a finance record reaches its configured retention boundary  
**When** the retention job is run  
**Then** guardian-consent photos are eligible for removal 90 days after the visit  
**And** finance records are retained for at least 10 years unless approved local legal or accounting rules require a longer period.

## Referrals, loyalty, and health summaries

### AC-27 — Track referrals without pre-payment rewards

**Given** a member shares a referral link before payment launch  
**When** a new person registers through it  
**Then** the sign-up attribution is recorded  
**And** no cash, discount, credit, or payment entitlement is issued.

### AC-28 — Award points only for eligible completed activity

**Given** a member has a confirmed eligible visit or fully completed course  
**When** loyalty points are calculated  
**Then** the qualifying activity is counted once under the configured rules  
**And** points remain private and non-cash, with redemption disabled until approved.

### AC-29 — Limit imported health summaries

**Given** a member chooses to use a supported health-summary source  
**When** MaydanGo reads activity  
**Then** only daily step totals and completed-workout counts are included  
**And** the data is read-only, private, and excluded from challenge totals.

## Payment and release gates

### AC-30 — Keep payments disabled until the final phase

**Given** payment providers, legal rules, and financial approvals are not finalized  
**When** a member views a plan, course, gift-course idea, or sample reservation  
**Then** no live payment, purchase, refund, payout, or paid access entitlement is created.

### AC-31 — Require local approval before financial launch

**Given** the final payment phase is proposed for release  
**When** Iraqi payment-provider, tax, invoice, refund, settlement, and reconciliation rules remain unapproved  
**Then** the payment launch is blocked  
**And** unresolved decisions are listed for the product owner and local advisers.

### AC-32 — Defer end-of-project device verification

**Given** feature-level automated and API checks pass  
**When** the project has not reached its final device-test phase  
**Then** no native-phone or final check-in-radius validation is claimed as complete.

## Source and document history

These scenarios are based on the MaydanGo requirements PDF, `docs/product-requirements.md`, and the user’s confirmed project decisions. Thresholds and behaviors are testable interpretations of those requirements; legal and payment-dependent cases remain gated as stated.

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 20 November 2026 | Replit Agent | Initial acceptance criteria for the MaydanGo product scope |
