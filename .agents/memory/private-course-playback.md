---
name: Private course playback
description: Access pattern for private course recordings stored in App Storage.
---

Keep recorded course assets in private storage. Replit's App Storage documentation says it does not provide temporary signed GET URLs; use a server-side streaming route instead of exposing a permanent object URL.

**Why:** Course playback links must expire and access must follow current membership and enrollment. A private streaming route can re-check those rules while serving range requests.

**How to apply:** Authorize link issuance, keep tokens short-lived, and re-check course publication, enrollment, and membership for each stream request.
