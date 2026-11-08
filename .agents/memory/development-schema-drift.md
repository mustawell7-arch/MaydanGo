---
name: Development schema drift
description: Safe handling of existing Drizzle conflicts in the MaydanGo development database.
---

When a development `db push` reports an existing relation conflict while new schema objects are still absent, stop and reconcile the existing schema drift before applying changes. Do not use force-approval to get past the prompt because legacy waitlist, attendance, and offering records may be affected.

The current development database contains populated legacy `activity_status` and `review_note` fields on `booking_offerings`; normal Drizzle push warns that dropping them would lose data. Keep these fields represented for compatibility, but continue using `approval_status` for the current offering review state. Do not use `push-force`.

**Why:** A normal push identified populated legacy offering fields as destructive changes, and a read-only `information_schema` query confirmed they exist. Earlier memory that the development database lacked `activity_status` was stale. A facility-profile table also remained absent after Drizzle reported an existing attendance relation.

**How to apply:** If a dev schema push fails around attendance, waitlist, or offering-status fields, inspect the current and source schemas and handle legacy-data decisions explicitly before retrying. Keep the legacy columns while they contain data; only use the standard non-force push once it shows no destructive changes.
