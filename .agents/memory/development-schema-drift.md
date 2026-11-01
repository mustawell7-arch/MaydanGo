---
name: Development schema drift
description: Safe handling of existing Drizzle conflicts in the MaydanGo development database.
---

When a development `db push` reports an existing relation conflict while new schema objects are still absent, stop and reconcile the existing schema drift before applying changes. Do not use force-approval to get past the prompt because legacy waitlist and attendance records may be affected.

Keep `approval_status` as the offering review state. The development database lacks the legacy `activity_status` column; do not reintroduce it in the ORM without an explicit additive migration and reviewed data transition.

**Why:** A facility-profile table remained absent after Drizzle reported that the existing attendance relation already existed; automatic approval could drop or replace legacy data. A later check-in test also confirmed that the database does not have the legacy offering-status column.

**How to apply:** If a dev schema push fails around attendance, waitlist, or offering-status fields, inspect the current and source schemas and handle legacy-data decisions explicitly before retrying. The normal post-merge setup remains the supported schema application path.
