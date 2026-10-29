---
name: Expo phone launch routing
description: Distinguishes a Replit web-page 404 from an Expo Go runtime failure.
---

When a phone shows a Replit-branded “Page not found” after opening a QR or link, verify the Expo tunnel independently: check `/status`, request the root manifest with `expo-platform: ios` and `expo-platform: android`, then request each manifest's `launchAsset.url`. A browser-rendered Replit 404 is not evidence that the native bundle failed.

**Why:** MaydanGo's live Expo tunnel returned successful manifests and native bundles while the provided phone screenshot showed `replit.com`'s page-not-found screen. Changing app routes would not address that evidence.

**How to apply:** If Expo manifests or bundle requests fail, debug the tunnel or app server. If they succeed, have the user open the artifact through Expo Go's scanner or Replit's “Preview on your phone” flow, and keep physical-device results marked pending until the native app itself is opened.
