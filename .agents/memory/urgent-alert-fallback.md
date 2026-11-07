---
name: Urgent report fallback
description: The selected backup destination and current in-app-only behavior for urgent safety alerts.
---

Urgent reports still unassigned after 30 minutes should trigger one generic push reminder to authorized support/admin staff selected by an admin and with notifications enabled; accepted escalation is recorded in the operation audit. The authorized in-app queue remains the fallback. Existing authorized staff stay selected during migration, new support staff default off, and an admin cannot disable or remove the last selected recipient. Only admins may view each staff member’s app push setting and count of active registered devices; never expose device tokens or describe readiness as proof of delivery. Recipient selection is separate from device push preferences. The public enquiry mailbox was selected as an intended external destination, but the Gmail sender connection was dismissed; do not claim an email was sent or include report details in an external notice unless an approved sender is connected.

**Why:** The user selected a 30-minute escalation delay and chose to continue without connecting Gmail. Preserving existing recipients avoids silently reducing coverage, while requiring an explicit choice for new staff limits report distribution. Readiness is only a server-side snapshot and does not prove OS permission or device delivery. Safety reports must not be sent through an unapproved channel or represented as emergency dispatch.

**How to apply:** Send urgent alerts only to selected admin/support roles that also allow push, expose readiness counts only in admin views, keep overdue reports visible to authorized staff, and explain that external email fallback is unavailable until an email sender is explicitly connected and verified.
