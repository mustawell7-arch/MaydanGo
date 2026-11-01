#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server exec tsx ../../scripts/backfill-waitlist.ts
pnpm --filter @workspace/api-server exec tsx ../../scripts/archive-waitlist-legacy.ts
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server exec tsx ../../scripts/apply-audit-history-migration.ts
pnpm --filter @workspace/api-server exec tsx ../../scripts/apply-push-delivery-recovery-migration.ts
pnpm --filter @workspace/api-server run seed:preview
