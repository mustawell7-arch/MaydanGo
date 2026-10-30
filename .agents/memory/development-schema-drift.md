---
name: Development schema drift
description: Safe handling of existing Drizzle conflicts in the MaydanGo development database.
---

When a development `db push` reports an existing relation conflict while new schema objects are still absent, stop and reconcile the existing schema drift before applying changes. Do not use force-approval to get past the prompt because legacy waitlist and attendance records may be affected.

**Why:** A facility-profile table remained absent after Drizzle reported that the existing attendance relation already existed; automatic approval could drop or replace legacy data.

**How to apply:** If a dev schema push fails around attendance or waitlist fields, inspect the current and source schemas and handle the legacy-data decisions explicitly before retrying. The normal post-merge setup remains the supported schema application path.
