---
name: Private course playback
description: Access pattern for private course recordings stored in App Storage.
---

Keep recorded course assets in private storage. Replit's App Storage documentation says it does not provide temporary signed GET URLs; use a server-side streaming route instead of exposing a permanent object URL.

**Why:** Course playback links must expire and access must follow current membership and enrollment. A private streaming route can re-check those rules while serving range requests.

**How to apply:** Authorize link issuance, keep tokens short-lived, and re-check course publication, enrollment, and membership for each stream request.

MaydanGo now adds a moving, non-identifying “Personal playback” overlay and hides built-in download and picture-in-picture controls. These are deterrents only; they do not prevent screen recording or replace DRM.

**Why:** The PDF calls for advanced video protection, but no DRM vendor or device-level protection target has been selected.

**How to apply:** Describe the watermark as a deterrent, not DRM. Keep the current private, access-checked stream; do not claim screen capture is blocked. Revisit provider-backed DRM only after the user selects a supported approach.
