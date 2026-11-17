# MaydanGo

MaydanGo connects people across Iraq with local sports, fitness, wellness, events, and online training through one membership platform.

## Run & operate

- API: `pnpm --filter @workspace/api-server run dev` — managed workflow supplies port `8080`.
- Public website: `pnpm --filter @workspace/maydango-web run dev` — managed workflow supplies port `25780` and its base path.
- Mobile app: `pnpm --filter @workspace/maydango run dev` — use the configured Expo workflow.
- Full typecheck: `pnpm run typecheck`.
- API contract code generation: `pnpm --filter @workspace/api-spec run codegen`.
- Development database schema push: `pnpm --filter @workspace/db run push`; review schema changes first and do not use this for production.
- The API requires `DATABASE_URL`. Do not print database connection strings or other secrets.

## Stack

- pnpm workspace monorepo.
- Customer mobile app: Expo and React Native.
- Public website: React and Vite.
- Backend: Express 5 API.
- Data: PostgreSQL with Drizzle ORM.
- API contract and client generation: OpenAPI, Orval, and generated Zod/client packages.
- Authentication: Clerk.
- Course and private-document files: Replit App Storage, served through access-checked API routes where required.
- Push notifications: Expo push service.

## Where things live

- `artifacts/maydango/` — customer mobile application.
- `artifacts/maydango-web/` — public website and browser portals.
- `artifacts/api-server/` — API, route modules, access controls, and backend tests.
- `lib/db/` — Drizzle database schema and migrations.
- `lib/api-spec/` — OpenAPI contract and API code generation.
- `lib/api-client-react/` and `lib/api-zod/` — generated API client and validation schemas.
- `docs/technical-architecture.md` — current architecture, service coverage, and deferred systems.
- `docs/database-entity-coverage.md` — Section 78 data-entity coverage and gaps.
- `docs/security-controls.md` — Section 79 control status, scan results, and release blockers.

## Architecture decisions

- Keep one secure API and PostgreSQL database as a modular backend; the current domain modules are not separate independently deployed microservices.
- Enforce identity, role, and organization scope on the server; browser or mobile navigation guards are not the security boundary.
- Keep recorded course media private and re-check access through API playback routes.
- Leave payments, live billing, refunds, wallet, and actual payouts gated until the final payment milestone.
- Build for all Iraqi regions and support Arabic, Sorani Kurdish, and English.

## Product scope

MaydanGo serves members, partners, instructors, companies, administrators, and Super Admins. The product includes physical facilities and activities, bookings, check-in, courses, live classes, events, support, and partner operations. Empty public listings are intentional until approved partner content is available; do not create sample venues or courses as if they were real.

## User direction

- Follow the uploaded product requirements PDF in document order; do not replace the next milestone with unrelated follow-up work.
- The user will provide approved imagery. Do not generate or search for photos.
- Keep user-facing wording clear, organized, and professional.

## Gotchas

- Use the managed artifact workflows; do not run the workspace root as a development server.
- Workflow configuration supplies required `PORT` and, for the website, `BASE_PATH`.
- Apply database changes to development only after reviewing for destructive changes. Production schema changes require the separate production migration process.
- Treat legal text as a draft until reviewed by qualified Iraqi counsel.
- Keep membership access, payment-provider settings, and settlement actions distinct; do not enable live money movement without the final payment milestone and verified provider prerequisites.
