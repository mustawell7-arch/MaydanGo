# Account bookings

The Clerk subject is the only owner identifier accepted by the member API. Clients cannot submit an owner, membership tier, attendance status, or payment status when reserving.

## Development

- `pnpm --filter @workspace/db run push` applies the additive development schema.
- `pnpm --filter @workspace/api-server run seed:preview` inserts sample offerings only. It is idempotent and does not reset existing dates or import local data.
- `pnpm --filter @workspace/api-server run test:bookings` runs isolated database/API regression tests, cleaning only records with its random test prefix.
- `pnpm --filter @workspace/api-spec run codegen` regenerates the shared client and validators.

Sign in in the app, then explicitly enable the sample trial from Account. It permits eight sample reservations over thirty days, with three per day. Some sample sessions require eligibility details. Sample offerings use concrete dates visible after sign-in; expired offerings fail explicitly rather than rolling bookings to a new date.

Old `maydango-app-v1` device data is left untouched and is not associated with a signed-in account. Reservations are not cached in device storage. Preferences and sample course/check-in interactions remain local and are not verified attendance.

## Enforcement

Creation checks availability, future date, server-owned membership status/payment/validity/tier, scope, cities, facilities, categories, quota, daily limits, optional facility/category limits, demographic restrictions, extra-payment requirements, duplicates, and capacity. Account and offering locks serialize concurrent quota and capacity checks. Cancellation is owner-filtered and deadline-aware; cancelled records remain as history. Coaching creates a request, not confirmation. No member route creates attendance.

The current catalogue is fictional. There is no client-accessible live membership activation or payment bypass. Actual partner onboarding, paid membership provisioning, a full administrator rules editor, partner approval, and verified QR/GPS attendance are separate product capabilities, not implied by these sample reservations.

In production, authentication keys and database schema must use the platform's managed environment process. Do not seed customers, paid memberships, or live partners as part of setup.
