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

Do not force the shared Zod 3 catalog to Zod 4 solely to clear an audit finding. Treat that as a deliberate compatibility migration across API, database, and generated-schema consumers; use bounded request bodies as interim protection.

**Why:** The security fix is available only in Zod 4, while this workspace currently depends on Zod 3 across shared validation paths.

**How to apply:** When an audit flags Zod 3, explain the major-version migration and get approval before changing the shared catalog.
