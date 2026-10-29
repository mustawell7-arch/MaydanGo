---
name: Expo tunnel subdomains
description: Avoiding ngrok endpoint collisions in the MaydanGo Expo workflow.
---
Give MaydanGo's Expo tunnel a subdomain distinct from the old `maydango-<short-repl-id>` endpoint. A prior Expo session can leave that ngrok endpoint online after no local Expo or ngrok process remains, causing `ERR_NGROK_334` and failing startup. A distinct app-specific suffix allowed the Expo tunnel and Metro bundle to start.

**Why:** Restarting the managed workflow did not release the already-online tunnel, while using a distinct subdomain resolved startup.

**How to apply:** If the same endpoint collision recurs, inspect for a duplicate process, then use a fresh app-specific tunnel subdomain rather than repeatedly restarting or treating the separate Linux DevTools `libglib` warning as the cause.
