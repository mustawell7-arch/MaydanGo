---
name: MaydanGo resource booking
description: Rules for reserving courts, rooms, and other named physical resources in MaydanGo.
---

Treat a resource booking as one reservation for a named physical resource and time window. Each slot has capacity one, overlapping active reservations for the same partner, facility, and resource are blocked, and resource bookings do not use waitlists or added payments. Require check-in setup before the activity can be published.

**Why:** This is the initial MaydanGo implementation of the PDF's court/room/resource booking model; the user has deferred payment integration and physical-device/radius testing until the end.

**How to apply:** Preserve the booking-versus-attendance boundary. Use a consistent English resource name across translated slots, keep partner confirmation as the attendance authority, and do not enable payments or perform radius/device testing before the deferred final stage.
