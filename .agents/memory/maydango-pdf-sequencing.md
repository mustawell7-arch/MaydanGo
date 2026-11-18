---
name: MaydanGo PDF sequencing
description: Keep ongoing MaydanGo work aligned with the user's uploaded product requirements PDF.
---

When the user says to continue MaydanGo work, identify and implement the next unfinished item from the uploaded product PDF in document order. Do not substitute agent-invented follow-up work for a PDF requirement. Keep payment implementation for the final stage, and leave end-to-end/device tests and check-in radius testing until the end as the user directed. Keep the Bird SMS connection open and untouched until all other PDF milestones are complete.

**Why:** The user repeatedly asked to continue the PDF chronologically and corrected when adjacent follow-up suggestions displaced that work. The user also explicitly directed that the Bird connection be done at the end.

**How to apply:** Before each continuation, locate the next incomplete PDF item, check the current code for existing coverage, then build that item before proposing anything outside the PDF. Do not configure Bird or start SMS delivery until every other PDF milestone is complete; keep its task open in the meantime. Treat the sign-up phone value as unverified user input: never send messages or trust it for verification until the final SMS flow confirms that exact number.
