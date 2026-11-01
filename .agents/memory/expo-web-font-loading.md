---
name: Expo web font loading
description: Why Expo web previews can remain blank when the root route waits for fonts.
---

Expo web should render routes immediately using a system-font fallback while bundled fonts load. Waiting for `useFonts` before mounting the router can leave the whole preview blank even when Metro and React started successfully.

**Why:** A restarted Expo web preview mounted React but showed a blank page without a runtime error; allowing web to render while font loading continued restored the screen.

**How to apply:** Keep font readiness blocking limited to native splash behavior. Do not return `null` for the entire web route while fonts are pending.
