---
name: Workspace type compatibility
description: Mixed Expo/web React types and Orval validator barrel pitfalls.
---
Keep a single compatible React type version across the Expo app and web sandbox.

**Why:** Independently resolved React declaration versions use distinct private symbols, causing otherwise identical refs and context types to become incompatible across dependencies.

**How to apply:** When package updates cause unrelated ref/context errors, check duplicate React declarations before changing components.

Generate Zod validators without a second TypeScript schema output in that same package; consume model types from the API client package.

**Why:** Orval automatically appends wildcard exports to package barrels. Request body validators and separate TypeScript request body models share names, making repeated code generation fail even if the barrel was manually corrected.

**How to apply:** Fix the generator configuration rather than manually editing generated exports after each run.
