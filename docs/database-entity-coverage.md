# MaydanGo database entity coverage

## Scope

This is a comparison of Section 78 in the product PDF with the Drizzle schema in `lib/db/src/schema/`. It describes the **source schema**, not proof that every migration has been applied to development or production databases.

The schema already supports much of the member, facility, booking, learning, support, and operations scope. Some concepts are intentionally embedded in a domain record or supplied by Clerk rather than represented by a separate table. Finance and payment entities remain gated for the final payment milestone.

## Status key

- **Represented** — a current schema table or external identity system stores the entity.
- **Embedded / shared** — represented as fields or a shared domain record rather than its own table.
- **Partial** — only the stated workflow or limited record type exists.
- **Deferred** — no complete production entity/workflow is represented yet; do not treat it as live.

## Entity map

| PDF entity | Current representation | Status |
| --- | --- | --- |
| Users | Clerk identity IDs referenced by application records; no local password table | Represented externally |
| Customer profiles | `member_profiles` | Represented |
| Optional member profile photos | `member_profile_photos` plus private App Storage objects | Represented; explicit consent and scoped partner delivery |
| Devices and device history | `member_devices`, `member_device_changes`, `member_device_events` | Represented |
| Admin users | Clerk identity plus `operators` | Represented |
| Admin roles and permissions | `operators.role`, `admin_role_permissions` | Represented |
| Partner companies | `partners` | Represented |
| Partner users | Operator records scoped by `partnerId` and partner-role checks | Represented through shared operator model |
| Facilities | `facility_profiles` | Represented |
| Locations | City, district, address, and coordinates stored with facility data | Embedded; no separate location table |
| Categories | Localized activity/category values stored with offering and facility content | Embedded; no central category table |
| Activities and sessions | `booking_offerings` records used by the booking domain | Represented |
| Instructors | `instructor_profiles`, access requests, course assignments, offering assignments | Represented |
| Courses and lessons | `learning_courses`, `learning_lessons` | Represented |
| Live classes | Live-class offerings and their schedule/details | Embedded in the offering model |
| Membership plans and rules | `membership_plans` with JSONB access rules | Represented |
| Subscriptions | `memberships`, `access_grants`, and gated `membership_billing` records | Partial; paid lifecycle is gated |
| Facility-access rules and partner-group limits | Membership-plan access-rule snapshots | Embedded in membership rules |
| Bookings | `reservations` | Represented |
| Waiting lists | `waitlist_entries` plus retained legacy history | Represented |
| Check-ins | `attendance`, `attendance_events` | Represented |
| QR codes and challenges | `checkin_challenges`, `manual_checkin_challenges`, `checkin_policies` | Represented |
| GPS records | Coordinates and accuracy are checked transiently during radius validation; the saved attendance record does not retain the member's exact coordinates | Partial by design; no persistent member GPS-history table |
| Payments | `membership_billing`, `payment_webhook_events` | Gated; not a live payment service |
| Refunds | Refund state and provider references in gated billing/correction records | Partial and deferred from launch |
| Invoices | `partner_invoice_submissions`, finance review and correction records | Partial; customer invoicing is deferred |
| Credit notes | No issued credit-note entity; correction records track review metadata and references | Deferred; final accounting treatment requires advice |
| Wallet transactions | No wallet ledger | Deferred |
| Promotions and sponsored placements | Sponsored facility/content campaign and placement-event tables | Represented for sponsored campaigns; no general coupon ledger |
| Referrals | `member_referral_codes`, `member_referral_attributions` | Represented for sign-up attribution only |
| Corporate clients and employees | `corporate_organizations`, `corporate_administrators`, `corporate_employees`, `corporate_invitations` | Represented for employee administration |
| Corporate billing | No active corporate billing ledger | Deferred |
| Events and tickets | Event offerings use the shared offering/reservation model | Partial; no separate ticket ledger and paid ticketing is deferred |
| Partner contracts | `partner_contract_versions`, partner onboarding and compliance records | Represented |
| Partner rates | No normalized partner-rate history table | Deferred with settlement/payment design |
| Settlements | Attendance eligibility and finance review records | Partial; reporting/status only |
| Partner and instructor payouts | No active payout ledger or money-transfer workflow | Deferred |
| Reviews | `facility_reviews`, review reports, responses, and moderation privileges | Represented |
| Support tickets | Support tickets, messages, attachments, events, links, and escalation records | Represented |
| Fraud alerts | Device-risk and attendance signals, restrictions, and urgent support reports | Partial; no complete fraud-case ledger |
| Notifications | Preferences, push devices/deliveries, and member updates | Represented |
| Translations | Localized JSONB content and client language catalogs | Partial; no centralized translation-management table |
| Audit logs | Append-only `operation_audit` and domain-specific event records | Partial; not every domain action is covered by one global ledger |
| Legal-document versions | `legal_policy_versions`, contract-version records, and consent events | Represented |
| Tax settings | No tax-configuration entity | Deferred for qualified Iraqi accounting/legal review |
| Bank-information changes | No dedicated bank-detail change history | Deferred with finance and payout controls |
| Chargebacks | No chargeback case or evidence ledger | Deferred |
| Financial reconciliation | No completed reconciliation ledger or external accounting integration | Deferred |

## Safe implementation approach

Do not create placeholder tables merely to match the PDF list. Add an entity when its owning workflow, access rules, retention, and lifecycle are defined. This avoids redundant tables for concepts already represented by shared records and prevents unsafe financial schemas before the final payment milestone.

Before applying any schema change:

1. Review the Drizzle source schema and existing database structure.
2. Use additive migrations where possible and preserve legacy data.
3. Run the relevant schema and API tests.
4. Apply and verify changes in development first.
5. Do not use `push-force` to bypass a destructive-change prompt.
6. Apply production migrations only through the separately reviewed production process.

The next data-model work should follow the PDF’s remaining implementation scope; wallet, chargebacks, tax configuration, partner rates, and money movement remain deferred with the final finance/payment work.
