---
name: Expo web Clerk loading
description: Prevent public Expo web routes from staying blank while Clerk restores a browser session.
---

Keep `ClerkProvider` active on Expo web, but do not gate the entire web route tree on `ClerkLoaded`. Public screens should render while browser auth initializes; protected API routes must continue to enforce authentication. Native screens keep their `ClerkLoaded` and device-security gates.

**Why:** The Expo web preview stayed entirely blank without runtime errors even though Metro and the public API were healthy. Rendering the web route tree outside the Clerk loading gate restored the Explore screen without weakening server authorization or native device checks.

**How to apply:** When debugging a blank Expo web preview, inspect global auth/loading gates as well as font loading. Restrict any web-specific bypass to the client initialization gate, never the Clerk provider, server auth, or native security flow.
