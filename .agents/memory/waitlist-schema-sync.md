---
name: Waitlist schema sync
description: Non-interactive Drizzle schema updates for the evolving waitlist table.
---

In this workspace, `drizzle-kit push --force` can still encounter a TTY-only column-rename prompt. The push may leave the database unchanged while the post-merge script continues to preview seeding. Retain legacy waitlist columns in the Drizzle schema until a data-preserving migration can rename, backfill, and retire them.

**Why:** The automatic merge setup ran without a TTY and the preview seed then failed because the development database lacked the new waitlist-offer column.

**How to apply:** Check the actual development schema and row counts after a waitlist change; do not assume `--force` resolved a rename prompt. Preserve old columns or explicitly migrate and verify queue order before removing compatibility fields.
