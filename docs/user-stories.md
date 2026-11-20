# MaydanGo — User Stories

| Document field | Value |
|---|---|
| Version | 1.0 |
| Last updated | 20 November 2026 |
| Status | Draft for product-owner review |
| Source | `docs/product-requirements.md` and the MaydanGo requirements PDF |

These stories describe user outcomes, not implementation status. “Must” stories define core product behavior. “Should” and “Later” stories are sequenced by the PDF phases and the owner’s decisions. Acceptance criteria are maintained separately as the next developer deliverable.

## Epic 1 — Member account and inclusive access

| ID | Priority / phase | User story |
|---|---|---|
| MBR-01 | Must · Phase 1 | As a member, I want to create and access my account securely so that I can use MaydanGo across supported devices. |
| MBR-02 | Must · Phase 1 | As a member, I want to use the app and website in English, Arabic, or Sorani Kurdish so that I can understand the service in my preferred language. |
| MBR-03 | Must · Phase 1 | As an Arabic- or Sorani-speaking member, I want right-to-left layouts and correctly aligned forms so that the interface remains readable and usable. |
| MBR-04 | Must · Phase 1 | As a member, I want schedules and activity dates shown in Iraq-local time so that I can plan accurately. |
| MBR-05 | Must · Phase 1 | As a member, I want to review and change my consent and marketing choices so that my preferences are respected. |
| MBR-06 | Must · Phase 1 | As a member, I want to request a copy of my personal data or ask for privacy support so that I can exercise my privacy rights. |
| MBR-07 | Must · Phase 1 | As a member under 18, I want the partner to verify guardian consent at the venue without MaydanGo collecting guardian details so that the process protects minors’ privacy. |

## Epic 2 — Discovery and membership

| ID | Priority / phase | User story |
|---|---|---|
| DISC-01 | Must · Phase 1 | As a member, I want to find participating gyms, sports clubs, pools, activity venues, events, and online options so that I can choose how to stay active. |
| DISC-02 | Must · Phase 1 | As a member, I want to filter facilities and activities by location, category, schedule, and relevant eligibility so that I can find options that fit my needs. |
| DISC-03 | Must · Phase 1 | As a member, I want facility and session pages to explain schedules, access conditions, safety, age, accessibility, and equipment details so that I can make an informed choice. |
| DISC-04 | Must · Phase 1 | As a member, I want to see what a membership plan includes and its limits so that I understand my eligibility before taking an action. |
| DISC-05 | Must · Phase 1 | As a member, I want the app to distinguish sample listings and preview reservations from live availability and confirmed access so that I am not misled. |
| DISC-06 | Should · Phase 2 | As a member, I want to discover clearly labeled sponsored activities so that I can distinguish promoted placements from ordinary listings. |
| DISC-07 | Later · Phase 3 | As a member, I want learning recommendations based on my saved and enrolled courses so that I can find relevant MaydanGo content without sending my learning data to an external AI service. |

## Epic 3 — Booking, waitlists, and attendance

| ID | Priority / phase | User story |
|---|---|---|
| BOOK-01 | Must · Phase 1 | As a member, I want to reserve an eligible activity or session so that my place is recorded with the provider. |
| BOOK-02 | Must · Phase 1 | As a member, I want the system to check my membership, eligibility, capacity, enrollment, and booking limits before confirming an action so that access rules are applied consistently. |
| BOOK-03 | Must · Phase 1 | As a member, I want to reserve a named court or room for a specific time so that two members cannot hold the same resource at once. |
| BOOK-04 | Must · Phase 1 | As a member, I want to join and review a waitlist when an activity is full so that I can be considered if a place becomes available. |
| BOOK-05 | Must · Phase 1 | As a member, I want to cancel within the stated rules and see the result clearly so that my place and any applicable allowance are handled correctly. |
| BOOK-06 | Must · Phase 1 | As a member, I want to check in using the approved QR and location process so that my attendance is tied to the correct visit. |
| BOOK-07 | Must · Phase 1 | As a member, I want a clear confirmation after a valid check-in so that I know my visit was recorded. |
| BOOK-08 | Must · Phase 1 | As a partner staff member, I want to confirm or review attendance for assigned sessions so that visit records are accurate. |
| BOOK-09 | Must · Phase 1 | As an administrator, I want manual check-ins to require staff identity, a reason, and an audit record so that exceptions remain accountable. |
| BOOK-10 | Must · Phase 1 | As a member, I want to review waitlist updates in the app even when push notifications are unavailable so that I can still see changes. |

## Epic 4 — Online courses, coaching, and home training

| ID | Priority / phase | User story |
|---|---|---|
| LEARN-01 | Must · Phase 1 | As a member, I want to find recorded courses and live online classes so that I can train from home or another suitable location. |
| LEARN-02 | Must · Phase 1 | As a member, I want each course to explain its language, level, duration, instructor, equipment, and disclaimers so that I can choose appropriately. |
| LEARN-03 | Must · Phase 1 | As a member, I want course lessons to remain protected by the course’s membership and enrollment checks so that a listing or collection does not grant access. |
| LEARN-04 | Must · Phase 1 | As a member, I want to save courses and review my progress so that I can return to learning that matters to me. |
| LEARN-05 | Should · Phase 2 | As a member, I want to join an eligible live class and review its schedule and joining instructions so that I can participate remotely. |
| LEARN-06 | Should · Phase 2 | As a member, I want to request one-to-one online coaching so that I can arrange personalized support. |
| LEARN-07 | Should · Phase 2 | As a course administrator, I want to organize at least two published courses into a localized collection with a chosen order so that members can discover a coherent learning path. |
| LEARN-08 | Should · Phase 2 | As a member, I want to browse course collections in English, Arabic, or Sorani Kurdish so that I can discover related courses in my preferred language. |
| LEARN-09 | Should · Phase 2 | As an instructor, I want to assign private practice tasks to learners in my approved courses so that they can track their own completion. |
| LEARN-10 | Should · Phase 2 | As an instructor, I want to approve course completion using only a learner’s name and completion information so that certificates do not expose unnecessary member data. |
| LEARN-11 | Later · Phase 3 | As a member, I want an approved completion certificate after instructor approval so that I can document course completion without it being represented as an accredited qualification. |
| LEARN-12 | Later · Phase 3 | As a member, I want to browse and start an eligible gifted course after gift rules are approved so that a gift can be used without bypassing course access controls. |
| LEARN-13 | Later · Phase 3 | As a member, I want the platform to deter unauthorized recording of private course playback while clearly explaining the limits of that protection. |

## Epic 5 — Partner onboarding and operations

| ID | Priority / phase | User story |
|---|---|---|
| PART-01 | Must · Phase 1 | As a partner, I want to submit organization and facility information so that MaydanGo can review an application. |
| PART-02 | Must · Phase 1 | As a partner, I want to see the application’s current stage and required next steps so that I know what is needed before approval. |
| PART-03 | Must · Phase 1 | As a partner-operations administrator, I want an inspection completed before approving a partner so that facilities meet the required readiness checks. |
| PART-04 | Must · Phase 1 | As a partner, I want to create and manage activities, schedules, capacity, eligibility, and instructions within my approved facilities so that members see accurate listings. |
| PART-05 | Must · Phase 1 | As a partner, I want to review upcoming bookings and assigned attendance work so that I can prepare for members’ visits. |
| PART-06 | Must · Phase 1 | As a partner, I want to contact MaydanGo support about my organization so that operational questions can be resolved. |
| PART-07 | Must · Phase 1 | As a partner-operations administrator, I want a quality review to start after three linked facility or safety tickets in 30 days, or after a rating below 3.5 from at least 10 reviews, so that repeated issues are reviewed consistently. |
| PART-08 | Must · Phase 1 | As an administrator, I want a venue suspension to block new actions while allowing sign-in so that the response matches the suspension reason. |
| PART-09 | Must · Phase 1 | As a member with an upcoming booking at a suspended venue, I want existing bookings preserved for administrative issues, but canceled with notice and the appropriate credit or refund for safety concerns, suspected fraud, or closure. |

## Epic 6 — Instructor and corporate portals

| ID | Priority / phase | User story |
|---|---|---|
| ROLE-01 | Should · Phase 2 | As an instructor, I want to request portal access so that MaydanGo can review my eligibility before granting access. |
| ROLE-02 | Should · Phase 2 | As an administrator, I want to approve an instructor and assign specific courses or sessions so that instructor access stays limited to approved work. |
| ROLE-03 | Should · Phase 2 | As an instructor, I want to see my assigned courses, upcoming sessions, and communication with the MaydanGo team so that I can manage my responsibilities. |
| ROLE-04 | Should · Phase 2 | As a corporate administrator, I want to enroll or manage employees in the company workspace so that employees can access the agreed service. |
| ROLE-05 | Should · Phase 2 | As a member, I want my employer’s administrator to be unable to view my activity or finance information so that my personal use remains private. |

## Epic 7 — Safety, privacy, and communication

| ID | Priority / phase | User story |
|---|---|---|
| SAFE-01 | Must · Phase 1 | As a member, I want to report a safety or facility concern so that MaydanGo can review it. |
| SAFE-02 | Must · Phase 1 | As a support administrator, I want an urgent report assigned or escalated after 30 minutes without an owner so that urgent issues do not remain unattended. |
| SAFE-03 | Must · Phase 1 | As a member, I want booking and activity information to explain relevant age, participant, family, and safety requirements before I attend. |
| SAFE-04 | Must · Phase 1 | As a member, I want my marketing choice honored before promotional messages are sent so that I receive only communications I have allowed. |
| SAFE-05 | Must · Phase 1 | As a MaydanGo administrator, I want to review emergency alert outcomes in the app so that I can see whether a report was acknowledged and handled. |
| SAFE-06 | Must · Phase 1 | As a member, I want my profile photo used only for permitted human comparison during an active check-in, not automated face matching, so that my biometric privacy is respected. |
| SAFE-07 | Must · Phase 1 | As a privacy administrator, I want guardian evidence retained for 90 days after a visit and finance records retained for at least 10 years by default, subject to local legal review, so that retention follows documented rules. |

## Epic 8 — Administration, audit, and financial controls

| ID | Priority / phase | User story |
|---|---|---|
| ADMIN-01 | Must · Phase 1 | As a MaydanGo administrator, I want task-specific permissions so that each staff member can access only the tools required for their role. |
| ADMIN-02 | Must · Phase 1 | As an administrator, I want to publish, unpublish, and review localized course content and collections so that members see only approved information. |
| ADMIN-03 | Must · Phase 1 | As an administrator, I want important partner, content, safety, and access changes recorded in an audit history so that decisions can be traced. |
| ADMIN-04 | Must · Phase 1 | As a finance administrator, I want audit history protected from ordinary edits and deletion so that financial records remain trustworthy. |
| ADMIN-05 | Must · Phase 1 | As a Super Administrator, I want high-risk actions to require the appropriate approval and strong authentication so that one account cannot silently change critical controls. |
| ADMIN-06 | Must · Phase 1 | As a platform operator, I want reports to use aggregated operational data where possible so that partner performance can be monitored without exposing unnecessary member details. |
| ADMIN-07 | Later · Final payment phase | As a member, I want to pay through an approved Iraqi payment method after the provider and legal rules are confirmed so that my membership can be activated safely. |
| ADMIN-08 | Later · Final payment phase | As a finance administrator, I want payment, invoice, refund, and settlement actions to follow role and approval rules so that financial changes are controlled and auditable. |
| ADMIN-09 | Later · Final payment phase | As a partner or instructor, I want settlement records to preserve historical terms and corrections to require approval so that completed financial periods are not silently rewritten. |

## Epic 9 — Referrals, loyalty, and health summaries

| ID | Priority / phase | User story |
|---|---|---|
| GROW-01 | Should · Phase 2 | As a member, I want to share a referral link and see sign-ups attributed to it so that I can understand whether people joined through my invitation, without earning payment-related benefits before payments launch. |
| GROW-02 | Later · Phase 3 | As a member, I want private, non-cash points for confirmed eligible visits and fully completed courses so that consistent participation can be recognized without public rankings. |
| GROW-03 | Later · Phase 3 | As a member, I want to track a personal fitness challenge using permitted attendance and self-logged activity so that I can follow my progress in Iraq-local time. |
| GROW-04 | Later · Phase 3 | As a member, I want to review only daily step totals and completed-workout counts from supported health sources so that I can use a private, minimal activity summary. |

## Deferred and excluded stories

- Gift-course purchasing or transfer is not ready to implement until the final payment phase defines eligibility, payment, recipient, refund, transfer, and expiration rules.
- Multi-country memberships, expansion beyond Iraq, and country-specific pricing remain unstarted until an expansion country is selected.
- Customer Community and third-party wellbeing-app integrations are excluded by the owner’s instruction.
- Bird SMS remains for the end of the full PDF roadmap. No message may be sent before the SMS flow is connected, tested, and the recipient number is verified.
- Native device tests and final check-in-radius tests remain end-of-project activities.

## Source and document history

This story set is derived from the MaydanGo requirements PDF and the decisions recorded in the project. It is a draft, not a claim that every story has been implemented. Numeric acceptance criteria and test cases are intentionally reserved for the separate acceptance-criteria deliverable.

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 20 November 2026 | Replit Agent | Initial user-story set aligned with the MaydanGo requirements and confirmed decisions |
