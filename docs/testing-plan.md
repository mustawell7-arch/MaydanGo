# MaydanGo — Testing Plan

| Document field | Value |
|---|---|
| Version | 1.0 |
| Last updated | 21 November 2026 |
| Status | Draft for product-owner review |
| Related documents | `docs/product-requirements.md`, `docs/user-stories.md`, `docs/acceptance-criteria.md`, `docs/technical-architecture.md` |

## 1. Purpose

This plan defines how MaydanGo requirements will be verified before acceptance. It is a test plan, not a test report: listing a scenario here does not mean it has been run or passed.

The plan preserves the product owner’s sequencing decisions:

- Keep feature-level development checks separate from final end-to-end and native-phone acceptance.
- Run real-device tests and final check-in-radius validation at the end of the project.
- Keep payment and financial-flow testing until the final payment phase.
- Connect and test Bird SMS only after all other PDF milestones; never send a message to an unverified number.
- Do not test excluded Customer Community or third-party wellbeing-app integrations.

## 2. Test environments and safeguards

1. Use development or explicitly approved staging data. Do not use production member, partner, payment, or health data for routine testing.
2. Label sample facilities, offers, accounts, reservations, and courses as test data. Do not present preview records as live availability.
3. Use separate test accounts for members, partner owners, partner staff, instructors, corporate administrators, support staff, finance staff, administrators, and Super Administrators.
4. Verify authorization at the API as well as in the interface. Hiding a button is not sufficient proof of access control.
5. Avoid sending email, SMS, push, or other external messages to real people during tests. Use a test route or provider sandbox where available.
6. Keep payments disabled until the final payment phase. Use provider test mode only after the owner and local advisers approve the payment test scope.
7. Do not collect guardian identity details or create biometric face templates during testing.
8. Keep imported health data limited to the approved summary fields; do not use it to award challenge progress.

## 3. Development checks

Run the relevant checks for changed code before the final acceptance cycle. The root workspace currently provides:

| Check | Command | Purpose |
|---|---|---|
| Install from the lockfile | `pnpm install --frozen-lockfile` | Confirm dependencies can be installed reproducibly. |
| Type-check workspace packages | `pnpm run typecheck` | Check shared libraries, the API, mobile app, and web app for TypeScript errors. |
| Build workspace packages | `pnpm run build` | Type-check and build packages that expose a build command. |
| Build the public website | `pnpm --filter @workspace/maydango-web run build` | Verify the website bundle and generated search files. |
| Check the mobile app | `pnpm --filter @workspace/maydango run typecheck` | Check the Expo mobile app types without claiming a native-device test. |

The API package exposes focused test commands. Run only suites relevant to the change during feature development; the full release scenarios in Section 5 remain for final acceptance.

| Area | Command |
|---|---|
| Booking and reservations | `pnpm --filter @workspace/api-server run test:bookings` |
| Check-in | `pnpm --filter @workspace/api-server run test:checkin` |
| Location helpers | `pnpm --filter @workspace/api-server run test:geo-utils` |
| Device rules | `pnpm --filter @workspace/api-server run test:devices` |
| Payment logic | `pnpm --filter @workspace/api-server run test:payments` |
| Facility hours | `pnpm --filter @workspace/api-server run test:facilities` |
| Support workflows | `pnpm --filter @workspace/api-server run test:support` |
| Finance controls | `pnpm --filter @workspace/api-server run test:finance` |
| Super Admin roles | `pnpm --filter @workspace/api-server run test:super-admin` |
| Corporate agreements | `pnpm --filter @workspace/api-server run test:corporate-agreements` |
| Waitlists and reservation schema | `pnpm --filter @workspace/api-server run test:waitlist` |

These commands do not replace browser, native-device, partner, privacy, or release acceptance tests.

## 4. Feature-level verification

Feature checks should cover the changed role and the main negative path. Record the exact build or commit, test data used, result, and any unresolved issue.

| Area | Required verification |
|---|---|
| Account and consent | Sign-in boundary; current consent required where applicable; declined marketing choice is respected; account data stays scoped to its owner. |
| Localization | English, Arabic, and Sorani Kurdish copy where supported; correct right-to-left direction; readable mixed-language values; Iraq-local dates and times. Full native-language review remains at the end. |
| Discovery | Search and filters return only current, approved listings; unpublished or sample records are not presented as live access. |
| Membership and booking | Server checks account, plan, enrollment, quota, eligibility, capacity, and deadlines; cancellation cannot silently conflict with recorded attendance. |
| Waitlist | Queue order, offer expiry, eligibility, cancellation effects, and member-visible status remain consistent. |
| Check-in | Valid and invalid QR flows, booking and membership checks, duplicate handling, manual exception reason, staff identity, and audit entry. Final radius behavior is tested on site at the end. |
| Partner operations | Organization and facility boundaries; inspection requirement; activity and schedule review; staff permissions; suspension behavior; operational reports. |
| Instructor portal | Access request and administrator decision; explicit course or session assignments; ownership of drafts and uploads; approval before publication; no unrelated member, booking, attendance, recording, or join data. |
| Learning and coaching | Course and enrollment access checks; lesson progress; saved courses; quizzes and completion; group-class capacity and booking; one-to-one coaching requests remain pending until provider response; instructor certificate decisions use only learner name and completion; collections do not grant access. |
| Corporate portal | HR can manage only its company’s employee enrollment; HR cannot access member activity, bookings, attendance, or finance. |
| Public website | Review public pages and enquiry flows at desktop and phone widths; confirm visitors can find help and legal information and that a contact fallback does not falsely claim an email was sent. |
| Support and safety | Ticket assignment, replies, escalation after the configured 30-minute delay, audit history, and truthful reporting of delivery outcomes. |
| Privacy and retention | Export or deletion request permissions; photo visibility limited to its authorized purpose; configured retention behavior; no guardian identity collection. |
| Reporting and referrals | Role-scoped reports; no unnecessary member details; sign-up attribution does not create money, discounts, or access. |
| Security | Authentication and API role checks; cross-account and cross-partner isolation; upload ownership; rate limits; audit protections for privileged changes. |

## 5. Final end-to-end and device acceptance

Run these scenarios only after the planned milestones are complete and the product owner starts the final acceptance phase. Use fresh test accounts and recorded test evidence.

| Scenario | Expected result |
|---|---|
| Install Android test build | Install the signed test APK directly, without Expo Go or a development server. Confirm the app opens and remains usable after a restart. |
| Sign in and reach discovery | Complete sign-in and load the venue list from the configured backend. A missing or unreachable service must show an actionable error. |
| Browse and book | Find an eligible published facility or class, review its rules, and complete or reject a booking according to membership, capacity, and timing. |
| Cancel and reconcile | Cancel an eligible booking and confirm waitlist, allowance, attendance, and notification records remain consistent. |
| QR and location check-in | Test valid QR at the facility, invalid or expired QR, location permission denial, a point inside the approved radius, and a point outside it. Record the tested facility and approved radius. |
| Manual check-in | Use an authorized staff account, require the reason and staff identity, and confirm the audit record. |
| Course access | Open an eligible course, record lesson progress, confirm an ineligible account cannot access the lesson, and confirm certificate approval uses the permitted learner data only. |
| Instructor and corporate boundaries | Confirm instructors see only assigned work and their team-support conversations; confirm corporate administrators see only their company’s employee enrollment data. |
| Safety response | Submit a test urgent report, verify assignment or escalation timing and outcome, and ensure no unconfigured external message is reported as sent. |
| Language and accessibility review | Review the complete supported native flows in English, Arabic, and Sorani Kurdish, including right-to-left layout, text clipping, forms, and accessibility labels. |
| Android device coverage | Test supported Android phone sizes, camera permission, location permission, app background and resume, and stable sign-in. |
| iOS device coverage | Test only after an installable iOS build is available; do not infer iOS readiness from an Android or web build. |

The signed Android APK is considered accepted only when installation, sign-in, and venue-list access work on a real Android phone. Creating a GitHub Actions artifact alone does not satisfy this acceptance check.

## 6. Final payment-phase tests

Do not execute live financial actions before the final payment phase and the required approvals. Once authorized, test in a provider sandbox first:

1. Successful and declined membership payments.
2. One-time purchases and paid course eligibility.
3. Renewal, retry, grace-period, cancellation, and reactivation rules.
4. Customer invoice and receipt numbering, contents, download, and correction history.
5. Refund and credit-note approval limits, dual approval, provider result, and customer notice.
6. Corporate invoice calculations and employee contributions, if approved.
7. Partner and instructor settlement calculations, disputes, corrections, payout approval, and reconciliation.
8. Chargebacks, duplicate or unmatched transactions, audit history, and recovery.
9. Verify that sample selections, course collections, referrals, loyalty points, and preview bookings do not create paid access.

Production payment testing requires a separate explicit release approval and the approved Iraqi provider and legal/accounting rules.

## 7. Final communication and integration tests

- Bird SMS is tested only after every other PDF milestone is complete. Use a verified test number and confirm consent, message content, failure handling, and duplicate prevention before any real delivery.
- Test push delivery only on supported devices and distinguish attempted, delivered, failed, and in-app-only outcomes.
- Do not claim live streaming, maps, email, SMS, or other external services are operational unless the selected provider is connected and its flow has been verified.
- Direct third-party wellbeing-app and Customer Community tests are excluded by the owner’s instruction.

## 8. Pass criteria and test record

A release scenario passes only when:

1. The expected result is observed in the intended role and platform.
2. API permissions and data ownership are correct, including the relevant denial case.
3. No unresolved release-blocking issue remains in the flow.
4. The result, environment, build or commit, tester, and evidence are recorded.
5. Required product-owner, partner, legal, accounting, or local-language approval is recorded where the flow depends on it.

Use this record for each final scenario:

| Field | Value |
|---|---|
| Scenario ID and name | |
| Build or commit | |
| Environment | |
| Device and OS, if applicable | |
| Test account role | |
| Test data identifiers | |
| Result: pass / fail / blocked | |
| Evidence or issue reference | |
| Tester and date | |
| Follow-up owner | |

## Source and document history

This plan is based on the MaydanGo requirements PDF, Sections 5–86, the product owner’s sequencing decisions, and the current package scripts. It does not certify any feature or integration as tested.

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 21 November 2026 | Replit Agent | Initial phased test plan with device, payment, localization, and communication gates |
