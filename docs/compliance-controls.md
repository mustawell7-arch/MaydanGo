# MaydanGo compliance controls

## Scope

This is a product-implementation status for Section 80 of the requirements PDF. It is not legal advice, a compliance certification, or confirmation that the product meets Iraqi law.

## Control status

| Requirement | Current status |
| --- | --- |
| Terms and privacy consent | **Implemented, pending approved policy text:** members record separate acceptance for the current Terms of Use and Privacy Policy. Changed published versions require fresh acceptance before member actions continue. Current public copy is still marked as a draft. |
| Marketing consent | **Implemented:** marketing choice is optional, versioned, and can be withdrawn. Pending marketing deliveries are cancelled when consent is declined. |
| Cookie consent | **Implemented for the current website:** optional analytics remain off until the visitor opts in. The choice is stored only in that browser, not on the member account or in the account export. No third-party analytics tracker is currently loaded. |
| Data export | **Implemented, version 1.1:** the signed-in owner can download an approved export for 24 hours. It includes account and service data, consent history, and member-visible support conversations with attachment metadata. It excludes credentials, payment instrument details, device tokens, private class links, staff-only notes, attachment contents, and browser-local cookie choice. |
| Account deletion requests | **Partial:** members can open a deletion-review request and authorized support staff can handle it as a case. There is no automatic or fully audited deletion execution flow yet. Retention exceptions and deletion steps must be approved before this is treated as complete. |
| Refund and invoice records | **Deferred with payments:** live refunds, customer invoice issuance, tax-document handling, and related payment operations remain gated until the final payment milestone. |
| Partner documents and licences | **Implemented, partial:** private uploads and scoped access are available for operational documents. Confirm which licence types and retention schedules are required with local advisers before partner onboarding goes live. |
| Policy version control | **Implemented:** admins can draft and publish versioned policy documents with an effective date; published versions remain retrievable. The legal wording and translations are not yet approved for publication. |
| Contract version control | **Implemented for partner contracts:** contract versions are kept traceable. Confirm member and corporate agreement templates and their approval history separately before launch. |
| Complaint records | **Implemented, partial:** support cases and safety reports are recorded with status and event history. Formal complaint retention periods and response deadlines still need local review. |
| Consent history | **Implemented:** accepted and declined choices are recorded with purpose, policy version, and timestamp; versioned events are included in the member data export. |
| Age and guardian controls | **Implemented to the user's direction:** 18 is the minimum age; the partner verifies guardian consent at the venue and uploads a private copy. Copies are scheduled for deletion 90 days after the visit. |
| Financial and tax retention | **Product default set to at least 10 years:** records show a retention date and are not automatically deleted at expiry. This is not confirmed Iraqi law and must be reviewed by qualified local legal and accounting advisers. |
| Invoice correction records | **Implemented, payment-gated:** corrections are retained as separate traceable records with the same 10-year review date; final payment and accounting rules remain subject to professional review. |
| Legal entity and contact details | **Intentionally incomplete:** MaydanGo is used as the service name; no registered entity, country of registration, or street address is asserted. Privacy requests use `maydangoing@gmail.com`. |

## Required before publication or launch

1. Obtain qualified Iraqi legal and accounting review of terms, privacy notices, contracts, complaints, tax records, refunds, and retention periods.
2. Approve the legal entity and jurisdiction details before adding them; do not invent a registered name or address.
3. Complete and audit the account-deletion workflow, including identity checks, retained-record exceptions, and confirmation to the requester.
4. Confirm privacy notices list the actual processors and payment providers that will be active at launch.
5. Have Arabic and Sorani Kurdish legal translations reviewed by qualified local speakers and counsel.
6. Enable live payments, refunds, and customer invoice operations only in the final payment milestone and after the associated policies are approved.
