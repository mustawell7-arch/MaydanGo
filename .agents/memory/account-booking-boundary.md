---
name: Account bookings and sample data
description: Why sample reservations and local preview state must remain isolated from live access.
---
Keep sample membership access separate from live membership entitlements. Enabling sample access must require an explicit acknowledgement; never infer a paid membership from a local plan selector.

**Why:** The existing app was a device-only prototype with fictional partners. Moving reservations to accounts must not silently turn those samples into real partner commitments, payments, or attendance.

**How to apply:** Preserve old device data without automatically assigning it to the next account that signs in. Label sample bookings as sample-only, and keep verified attendance separate from reservations.
