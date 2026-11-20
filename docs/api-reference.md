# MaydanGo API reference

| Document field | Value |
|---|---|
| Version | 1.0 |
| Last updated | 20 November 2026 |
| Status | Draft — based on the current OpenAPI contract and API implementation |
| Contract source | `lib/api-spec/openapi.yaml` and `lib/api-spec/operations.yaml` |

## 1. Overview

MaydanGo exposes a shared REST API for the mobile app, website, and role-specific portals. The API is the authority for booking eligibility, attendance, membership access, partner permissions, course access, and private files.

The current OpenAPI contract contains **303 operations across 264 paths**. OpenAPI is the source of truth for operation paths and schemas; this guide summarizes how to connect and which route families serve each product area.

## 2. Base path and clients

The OpenAPI server base is `/api`. Paths shown below are relative to that base; for example, `/member/bookings` is reached at `/api/member/bookings` on the API origin.

- **Web:** use the same-origin API path and the active Clerk browser session.
- **Mobile:** the generated client uses the configured API domain and attaches a Clerk bearer token. The native client may also attach the installation token used by device controls.
- **Both clients:** use the generated hooks from `@workspace/api-client-react`; do not hand-copy request and response types.
- **Contract updates:** edit the OpenAPI source, validate it, then run `pnpm --filter @workspace/api-spec run codegen`. Do not hand-edit generated client or Zod files.

The OpenAPI document currently does **not** declare a global `securitySchemes` or endpoint-level `security` requirement. Authentication and role checks are implemented in the API routes and middleware, so generated documentation alone cannot tell a caller which routes require a session. That contract gap should be closed before publishing an external developer portal.

## 3. Route families

| Product area | Main route families | Access boundary |
|---|---|---|
| Public discovery | `/public/facilities`, `/public/catalog`, `/public/offerings`, `/public/plans`, `/public/courses`, `/public/course-bundles`, `/public/instructors`, `/public/sponsored-*`, `/policies` | Published content only; no private member data |
| Member account and privacy | `/member/profile`, `/member/account`, `/member/consents`, `/member/privacy-requests`, `/member/profile-photo`, `/member/referrals`, `/member/notifications/*`, `/member/device` | Signed-in member; records are scoped to the caller |
| Membership and booking | `/member/plans`, `/member/allowances`, `/member/subscription`, `/member/bookings`, `/member/offerings/*/waitlist`, `/member/waitlist/*` | Signed-in member; server evaluates eligibility and availability |
| Attendance | `/attendance`, `/attendance/scan`, `/attendance/{id}/qr`, `/attendance/{id}/manual*`, `/attendance/{id}/review` | Staff, member, device, and reservation checks depend on the operation |
| Learning | `/member/courses/*`, `/member/course-bundles`, `/member/live-classes`, `/member/fitness-challenges`, `/member/activity-sync`, `/member/loyalty-points` | Member-owned progress; course and class access checks remain in force |
| Instructor portal | `/instructor/*` | Approved instructor access, limited to assigned courses or sessions |
| Partner onboarding and operations | `/partner-onboarding/*`, `/operations/facilities/*`, `/operations/offerings/*`, `/operations/contracts/*`, `/operations/partner-onboarding/*` | Applicant ownership, partner scope, and staff permissions are enforced server-side |
| Corporate portal | `/corporate/*`, `/operations/corporate-organizations/*` | Organization-scoped employee administration; does not grant HR access to member activity or finance |
| Support and safety | `/member/support/*`, `/support/staff/*`, `/operations/quality/*`, `/operations/fraud/*` | Member ownership or assigned staff role; sensitive routes require additional permissions |
| Administration and finance | `/operations/*`, `/super-admin/*` | Role-based permissions and resource scope; finance operations remain subject to payment-phase gates |
| Health | `/healthz` | Service health only |

The route prefix is a useful guide, not a substitute for the endpoint’s authorization check. Treat all private operations as requiring authentication unless their implementation and contract explicitly say otherwise.

## 4. Common request and response behavior

- JSON is the normal request and response format. The API accepts JSON bodies up to 100 KB; the signed payment webhook has a separate raw-body limit.
- The API client parses JSON, text, and file responses and raises an `ApiError` for non-success HTTP responses.
- Routes can return endpoint-specific validation and conflict errors. A `404` generally means the requested record is unavailable to the caller or does not exist; a `403` means the caller lacks the required scope or permission; a `409` indicates a state or uniqueness conflict.
- The API has a generic server-error response. Do not rely on internal exception text being returned to clients.
- Use the server-provided dates and timestamps for state transitions. Calendar dates and schedule times must be interpreted according to the activity’s configured Iraq-local schedule, not silently converted to the device’s timezone.
- POST and PATCH operations are not universally idempotent. Follow each operation’s response and retry guidance; do not blindly retry a booking, invitation, payment, or upload-completion request.

## 5. Private upload and download pattern

Documents and media use a staged upload flow:

1. Call the relevant `upload-url` operation while authenticated.
2. Upload the file to the returned short-lived URL. Keep that URL private and use it only for that upload.
3. Call the matching `complete` operation so the API can validate and promote the file into its private location.
4. Retrieve private content only through the corresponding access-checked API route.

This pattern is used for partner onboarding documents, contracts, course materials, instructor drafts, support attachments, profile photos, compliance records, and guardian-consent evidence. Do not expose permanent public URLs for these files. Course playback and downloads require the member’s enrollment and access checks.

## 6. Rate limits and origin checks

The API checks request origins and applies account-based rate limits. Current limits include:

| Route group | Limit |
|---|---:|
| Attendance QR scan | 12 requests per account per minute |
| Member bookings | 20 requests per account per minute |
| Other `/api` requests | 300 requests per account per minute |

The current limiter stores counters in API-process memory. Limits are therefore not shared between multiple server instances; a shared limiter or gateway policy is needed before horizontal scaling.

## 7. Deferred and gated operations

The existence of an endpoint does not mean a workflow is live:

- Checkout, refunds, and payment-related operations require the API’s payment enablement and verification gates. Live payment launch remains deferred to the final payment milestone.
- Finance reporting, invoice correction, settlement review, and payout tracking do not initiate bank transfers unless a separately approved provider flow exists.
- Course bundles are discovery groupings. They do not grant enrollment, course access, or paid gift entitlements.
- Preview membership and sample data must not be treated as a paid entitlement.
- Live-class schedule and join routes do not establish that a production streaming provider is connected.

## 8. Contract maintenance and verification

Before changing an endpoint:

1. Update the relevant path and schema in `lib/api-spec/openapi.yaml` or `lib/api-spec/operations.yaml`.
2. Confirm request and response schemas match the route implementation and its tests.
3. Validate the OpenAPI document, including external references.
4. Regenerate the React Query client and Zod package with `pnpm --filter @workspace/api-spec run codegen`.
5. Run API tests and workspace type checks.
6. Review role, ownership, privacy, retention, and audit behavior for the changed operation.

Do not document an operation as available merely because it appears in the specification. Verify its implementation, authorization rules, and feature gates before exposing it to external developers.

## 9. Source locations

- API contract: `lib/api-spec/openapi.yaml`, `lib/api-spec/operations.yaml`
- Code generator: `lib/api-spec/orval.config.ts`
- Generated client and fetch behavior: `lib/api-client-react/src/`
- API route modules and middleware: `artifacts/api-server/src/routes/`, `artifacts/api-server/src/middlewares/`
- Database entities and constraints: `lib/db/src/schema/`

