---
name: Urgent report fallback
description: The selected backup destination and current in-app-only behavior for urgent safety alerts.
---

Urgent reports still unassigned after 30 minutes should trigger one generic push reminder to authorized support/admin staff with notifications enabled, and the escalation should be recorded in the operation audit. The authorized in-app queue remains the fallback. The public enquiry mailbox was selected as an intended external destination, but the Gmail sender connection was dismissed; do not claim an email was sent or include report details in an external notice unless an approved sender is connected.

**Why:** The user selected a 30-minute escalation delay and chose to continue without connecting Gmail. Safety reports must not be silently sent through an unapproved channel or be represented as emergency dispatch.

**How to apply:** Keep overdue reports visible to authorized staff, send only generic push reminders through the existing opted-in staff channel, and explain that external email fallback is unavailable until an email sender is explicitly connected and verified.
