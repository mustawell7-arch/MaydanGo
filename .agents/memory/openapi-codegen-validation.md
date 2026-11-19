---
name: OpenAPI code generation
description: Protect generated API clients and schemas when updating the shared OpenAPI contract.
---

Validate OpenAPI edits before running the workspace's Orval codegen. Orval cleans generated output folders before it validates the specification, so a validation failure can remove the currently generated API client and Zod schemas. Rerun codegen immediately after correcting a failed spec validation.

**Why:** A malformed response description caused the codegen step to delete generated files before it reported the OpenAPI validation error.

**How to apply:** Check YAML structure and OpenAPI validation before codegen, especially for inline response objects and unquoted descriptions.
