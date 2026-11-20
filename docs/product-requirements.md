# MaydanGo — Product Requirements Document

| Document field | Value |
|---|---|
| Version | 1.0 |
| Last updated | 20 November 2026 |
| Status | Draft for product-owner review |
| Product owner | MaydanGo product owner — to be named |
| Primary audience | MaydanGo product, engineering, design, operations, and review teams |
| Decision supported | Align scope, sequence implementation, and define release gates |

## 1. Executive summary

MaydanGo is a multi-partner membership and wellbeing platform for people in Iraq. Members should be able to discover and use participating gyms, sports clubs, pools, event venues, live online classes, recorded courses, and online coaching through one service.

The product must serve Iraq’s regions—including Kurdistan, the north, west, south, and central areas—without treating one community as the default. Its customer experience must support English, Arabic, and Sorani Kurdish, including right-to-left layouts and Iraq-local date and time handling. Content, imagery, and motivation should be respectful and inclusive.

The platform combines a member mobile app, public website, partner operations portal, instructor portal, corporate employee portal, administration tools, and shared APIs. Access to a venue, class, booking, or course must be checked by the relevant server-side rules. Browsing a listing or grouping courses into a collection must not grant a reservation, membership, enrollment, or payment entitlement.

MaydanGo is being built in phases. Payments and payment-dependent access changes are intentionally reserved for the final phase. Safety, privacy, controlled administration, and auditable operations are release requirements—not later enhancements.

## 2. Problem and opportunity

People in Iraq may need to use separate services to find sports facilities, book activities, attend events, train from home, and arrange coaching. Providers also need a consistent way to publish their facilities and sessions, handle bookings, and work with MaydanGo.

MaydanGo aims to make these options easier to find and manage while preserving clear access rules and local choice. Members should be able to choose activities that fit their location, schedule, language, comfort, and circumstances—including training at home.

The product must not imply that every listing is available in every city or that a membership includes every activity. Availability and access depend on the published provider, location, membership rules, capacity, and any required enrollment.

## 3. Product goals

1. Give members one understandable place to discover participating in-person and online activities across Iraq.
2. Support a broad range of participants and regions without discriminatory or disrespectful content, defaults, or policies.
3. Give partners practical tools to apply, prepare facilities, publish approved activities, manage bookings, and respond to member support.
4. Let instructors work only with courses or sessions that an administrator has assigned to them.
5. Give corporate clients a limited, privacy-respecting way to enroll employees.
6. Provide MaydanGo administrators with role-specific controls, operational visibility, and reliable audit history.
7. Keep membership, enrollment, booking, attendance, and payment states distinct and enforce them on the server.
8. Establish a safe foundation for later payments, settlements, and integrations without activating them prematurely.

## 4. Non-goals and explicit boundaries

- Do not copy Urban Sports Club’s branding, interface, text, images, code, or distinctive workflows. It is only a high-level reference for the category and purpose of a multi-provider membership service.
- Do not enable live payments, payment gateways, paid gift-course access, payouts, or financial entitlements before the final payment phase.
- Do not turn sample reservations, local plan selections, previews, or course collections into live access rights.
- Do not implement the Customer Community or third-party wellbeing-app integrations; the user explicitly skipped both.
- Do not add a Middle East expansion country until MaydanGo selects one. Iraq remains the only configured market.
- Do not collect guardian identity details. For members under 18, the partner verifies the required guardian consent at the venue.
- Do not use automated facial recognition. If an authorized staff member needs a visual check during an active check-in, it is a human comparison only.
- Do not create, search for, or substitute imagery on the user’s behalf. MaydanGo will supply or approve visual assets.
- Do not use course collections to bypass a course’s membership or enrollment requirements.

## 5. Target users and roles

| Role | Primary need | Access boundary |
|---|---|---|
| Member | Discover activities, manage a membership, book eligible sessions, check in, learn, and contact support | Can view and change only their own account and eligible bookings |
| Partner owner or manager | Apply, prepare facilities, manage approved locations and activities, and oversee partner operations | Limited to their organization and authorized facilities |
| Partner staff | Manage assigned check-in and booking work | Limited to the tools needed for their assigned venue duties |
| Instructor | View assigned courses and upcoming sessions, track permitted learner work, and contact the MaydanGo team | Access is requested, approved, and assigned; no broad member or partner data access |
| Corporate administrator | Enroll or manage employees in the company workspace | Initial scope is employee enrollment only; no access to member activity or finance |
| MaydanGo administrator | Perform an assigned operational function such as content, partner, support, or finance work | Granular permission by task; no default full-platform access |
| Super Administrator | Configure and oversee platform-wide rules and privileged operations | Strong authentication, restricted high-risk actions, and audit logging required |

Instructor access must be approved by an administrator and assigned to specific courses or sessions. Instructors may see only the information needed for their assignments. Certificate approval uses the learner’s name and completion information only. Course assignments are practice tracking; member completion remains private.

Existing full-administrator access is to be restricted to role-specific permissions. Corporate tools initially support employee enrollment only. These boundaries must be enforced in APIs as well as in the interface.

## 6. Product experience and core requirements

### 6.1 Member discovery and account

- Members can explore facilities, sports clubs, pools, activities, events, online classes, courses, and coaching.
- Listings show the information needed to make a respectful and informed choice, including location, schedule, participant eligibility, age requirements, accessibility, equipment, and safety instructions when relevant.
- Members can use the service in English, Arabic, or Sorani Kurdish. Layout direction, date/time format, and navigation must follow the selected language.
- Member profile information and photos are private by default. Any staff visual comparison is limited to authorized staff during an active check-in.
- Members can review consent choices, manage communication preferences, and submit privacy or account-data requests.

### 6.2 Membership, booking, and attendance

- Membership rules are configurable rather than hard-coded. They may define included facilities, activities, cities, visit limits, course access, and other quotas.
- Before a booking, reservation, check-in, or course action, the server verifies the relevant account status, eligibility, membership rule, capacity, enrollment, and timing requirements.
- The product distinguishes a booking from attendance, a confirmed visit, a no-show, a dispute, and a settlement-eligible event.
- Waitlists and cancellation behavior must preserve capacity and attendance records; cancellations must not silently conflict with recorded attendance.
- Resource bookings, such as a named court or room, are exclusive for the selected resource and time.
- QR and location checks are part of the target check-in flow. Device testing and final check-in-radius validation remain end-of-project release checks.
- Manual check-in is a restricted exception requiring an authorized staff identity, reason, and audit record.
- Sample or preview reservations must never be represented as live tickets, attendance, partner confirmation, or financial settlement.

### 6.3 Courses, coaching, and live classes

- Members can discover recorded courses, live online classes, and one-to-one online coaching, including options suitable for training from home.
- Course metadata and learning paths can be presented in English, Arabic, and Sorani Kurdish.
- A course’s own membership and enrollment checks remain authoritative, even when the course appears in a public listing, recommendation, or collection.
- Course collections group at least two courses in an administrator-defined order. Collections organize discovery only; they do not create enrollment or payment access.
- Course recommendations are calculated within MaydanGo using saved and enrolled-course signals; learning signals are not sent to an external AI provider.
- Course assignments are private practice tracking. Certificates are non-accredited completion records issued after instructor approval.
- Live-streaming hosting and paid or gift-based course access remain separate integrations or payment-dependent work.

### 6.4 Partner onboarding and facility quality

- Partner onboarding follows a controlled sequence from application and review through documents, contract, facility setup, QR issuance, staff training, inspection, approval, and live status.
- An inspection is required before staff approve a partner application.
- Partner publishing permissions and activity review are controlled by MaydanGo. A trusted publishing setting must not bypass onboarding approval.
- A facility quality review is triggered by three linked facility or safety tickets within 30 days, or by an average rating below 3.5 after at least 10 reviews.
- A suspension permits sign-in but blocks actions. Administrative issues allow existing bookings while preventing new ones. A safety concern, suspected fraud, or closure cancels affected upcoming bookings, notifies customers, and returns the relevant credits or payment after payment functionality is available.

### 6.5 Safety, communications, and privacy

- MaydanGo must present safety information and participant eligibility clearly and respectfully.
- Urgent reports need assignment, escalation, and an auditable response history. The selected escalation delay for an unassigned urgent report is 30 minutes.
- The public enquiry email is `maydangoing@gmail.com`. Email or SMS delivery must not be claimed as operational until the delivery integration is connected and tested; the current fallback is in-app.
- Marketing choices must be honored before promotional messages are sent.
- Members aged 18 and over meet the standard age requirement. A person under 18 may participate only with guardian consent verified by the partner at the venue; MaydanGo must not collect guardian details.
- Guardian-consent photos, if collected by a partner as evidence, are retained for 90 days after the visit and then removed under the applicable retention process.
- Finance records use a 10-year minimum retention default, subject to confirmation by Iraqi legal and accounting advisers before automated deletion rules are enabled.
- The privacy notice must identify the actual services that process personal data. The user stated that no other providers were intended; the current implementation uses Clerk for authentication and Replit-managed storage for files, so the privacy statement must be reconciled with the real system before publication.
- MaydanGo is the public product name. No legal company name, registration country, or address has been confirmed for the policy pages.

### 6.6 Partner, instructor, corporate, and administration tools

- The partner portal supports applications, approved facility setup, activity and session management, bookings, check-in work, support, and operational reporting within assigned permissions.
- The instructor portal supports access requests, administrator-approved assignments, upcoming assigned work, private practice tracking, permitted certificate approval, and communication with the MaydanGo team.
- The first corporate portal release supports employee enrollment only. HR users must not see member activity or finance information.
- Administration is separated by responsibility, including partner operations, support, content, finance, marketing, corporate operations, and compliance.
- Sensitive changes require appropriate approval and an immutable audit trail. Finance audit history cannot be edited or deleted by ordinary administrators.
- Partner, instructor, corporate, and administration surfaces are separate authenticated web experiences.

### 6.7 Loyalty, referrals, and wearables

- Before payments, referrals track sign-ups only; they do not award cash, discounts, or payment-related benefits.
- Loyalty points are private and non-cash. Eligible activity is confirmed visits and fully completed courses. Redemption remains deferred.
- Fitness challenges may use verified attendance and private self-logged activity, counted once per day in Iraq-local time. They must not introduce rankings or rewards.
- Health summaries are limited to daily step totals and completed-workout counts. They are read-only and private; imported summaries do not count toward challenges.
- Customer Community and direct third-party wellbeing-app connections are excluded by the user’s instruction.

## 7. Localization and inclusion

1. Support English, Arabic, and Sorani Kurdish throughout member-facing flows and relevant content-management fields.
2. Provide correct right-to-left rendering for Arabic and Sorani Kurdish, including mixed-language text, form fields, validation, and navigation.
3. Use Iraq-local time for schedules and activity-day calculations. Confirm currency and payment formatting with local finance and legal advisers before payment release.
4. Support participation options that reflect partner-defined women-only, men-only, mixed, family, and other approved sessions without implying that one option is universal.
5. Avoid assumptions about region, ethnicity, language, gender, ability, or access to a gym. Home-based classes and online coaching must remain visible alternatives.
6. MaydanGo must supply or approve photographs and cultural imagery. The product team must review assets and copy with people familiar with the relevant Iraqi communities.

## 8. Competitive context

Urban Sports Club is a reference for the broad product category: membership-based discovery across multiple sports and providers. MaydanGo must develop its own identity and implementation. Its differentiation is Iraq-first coverage, English/Arabic/Sorani support, locally appropriate participation options, home training, and clearly enforced access and safety rules.

| Alternative | What it helps people do | MaydanGo’s distinct response |
|---|---|---|
| Urban Sports Club | Serves as a high-level reference for the multi-provider membership category | Build an original Iraq-focused product, language support, service model, identity, interface, and content; do not reuse its protected material or distinctive implementation |
| Booking directly with one provider | Find and arrange an activity at that provider | Offer cross-provider discovery where MaydanGo has an approved, current listing, without implying universal availability |
| Separate event, class, or training services | Find individual events or online programmes | Bring approved in-person and at-home options together while preserving each provider’s eligibility and access rules |
| Training at home without a discovery service | Exercise without traveling to a facility | Make online classes, recorded courses, and coaching discoverable for members who prefer or need home-based options |

## 9. Phased scope and sequencing

### Phase 1 — Core launch foundation

Member registration and profiles; facility discovery; membership rules; bookings and waitlists; partner onboarding and operations; QR/location check-in foundation; online courses and live-class discovery; public website; role-based administration; customer support; privacy, consent, audit, and basic reporting.

### Phase 2 — Growth

Events and ticketing; premium services; referral sign-up tracking; guest passes; corporate and instructor portals; advanced course and live-class features; partner integrations; sponsored placement and marketing tools; and advanced operational reporting. Wallet transactions, gift-card purchase or redemption, instructor and partner payouts, accounting integration, Apple Pay, Google Pay, and other live financial actions are held for the final payment phase.

### Phase 3 — Ecosystem

Advanced coaching; quizzes, certificates, and assignments; internal course recommendations; fitness challenges; loyalty points; wearables and health summaries; advanced video protection; course bundles; gift courses; and any later regional expansion that the owner explicitly approves.

### Sequencing constraints

- Payment integration, paid entitlements, payouts, and gift-course access are reserved for the final payment phase.
- Gift cards, wallet transactions, refunds, invoicing, and settlement actions that move money are also reserved for the final payment phase, regardless of their phase in the PDF.
- Bird SMS is reserved until all other PDF milestones are complete.
- Device testing and final check-in-radius validation are reserved for the end.
- Regional expansion, multi-country memberships, and country-specific pricing remain out of scope until a country is selected.
- Gift courses require approved rules for payer, recipient, eligibility, transfer, expiration, refund, and course-access handling before implementation.

## 10. Success measures

No analytics baselines or numeric targets have been supplied. Establish targets after reliable instrumentation and a representative Iraq launch cohort are available. The product should be able to measure:

- Account creation completion and the proportion of members who reach a first useful discovery or booking action.
- Search-to-booking conversion, booking completion, cancellation, waitlist conversion, attendance confirmation, and no-show review rates.
- Course discovery, enrollment eligibility, lesson-start rate, and course completion—without exposing one member’s learning activity to another.
- Partner application completion, time to approval, time to first published activity, and response to quality or safety reviews.
- Support response and resolution times, including the 30-minute urgent-report assignment target.
- Localization defects, failed consent recording, access-control denials, and other release-critical errors.
- Payment success, refund, reconciliation, and settlement measures only after the final payment phase is approved and launched.

Metrics must be segmented only where lawful and useful. Do not introduce sensitive profiling or public leaderboards.

## 11. Release and quality gates

A milestone is ready for acceptance when:

- The stated user flow works in the intended role and platform.
- Permission checks are enforced by the API, not only hidden in the interface.
- Booking, membership, course enrollment, and payment states remain distinct.
- Arabic, English, and Sorani Kurdish layouts are reviewed, including right-to-left forms.
- Safety, age, privacy, and audit behavior is covered by tests.
- No third-party communication, payment, health, or storage behavior is described as live unless connected and verified.
- Required legal, accounting, and partner-policy decisions are documented before enabling dependent behavior.
- Native phone tests and final check-in-radius tests are completed at the end of the project, as directed.

## 12. DACI and ownership

| Role | Assigned owner | Responsibility |
|---|---|---|
| Driver | MaydanGo product owner — to be named | Maintains this document, resolves scope questions, and coordinates reviews |
| Approver | MaydanGo owner — to be named | Sole final approver for product scope and release decisions |
| Contributors | Engineering lead; partner-operations lead; design/localization lead — names to be assigned | Validate feasibility, operational workflow, and inclusive Iraqi localization |
| Informed | Support, finance, legal/accounting advisers, and participating partners | Receive relevant changes and provide review where needed |

The current team size and delivery culture have not been confirmed. No staffing or schedule estimate is included in this draft.

## 13. Open decisions and dependencies

1. Confirm whether Flutter is a contractual delivery requirement. The PDF requests Flutter Android and iOS applications, while the current mobile application is built with Expo/React Native. This PRD does not authorize a framework migration.
2. Select and validate Iraqi payment and mobile-wallet providers, then approve payment, refund, settlement, and reconciliation rules with local advisers.
3. Confirm Iraqi legal, accounting, consumer-protection, tax, fitness-liability, and data-retention requirements.
4. Reconcile the privacy statement’s intended providers with the actual authentication, storage, analytics, and messaging services used at launch.
5. Define gift-course eligibility and transfer rules in the final payment phase.
6. Confirm which Iraqi cities and partner locations will be available at launch; do not represent sample listings as live availability.
7. Set measurable launch targets after baseline data is available.
8. Confirm any future supplement-store link or integration; its intended scope has not been established.
9. Confirm named DACI owners and obtain product-owner approval of this draft.

## 14. Source and document history

This draft is based on the MaydanGo multi-marketplace requirements PDF, Sections 1–84, together with the user’s project decisions recorded during implementation. It captures product intent and constraints; it is not legal advice, a launch certification, a complete user-story set, or a substitute for the separate acceptance criteria and technical deliverables listed in the PDF.

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 20 November 2026 | Replit Agent | Initial requirements draft based on the MaydanGo PDF and confirmed project decisions |
