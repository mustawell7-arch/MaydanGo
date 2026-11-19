---
name: MaydanGo PDF sequencing
description: Keep ongoing MaydanGo work aligned with the user's uploaded product requirements PDF.
---

When the user says to continue MaydanGo work, identify and implement the next unfinished item from the uploaded product PDF in document order. Do not substitute agent-invented follow-up work for a PDF requirement. Keep payment implementation for the final stage, and leave end-to-end/device tests and check-in radius testing until the end as the user directed. Keep the Bird SMS connection open and untouched until all other PDF milestones are complete.

**Why:** The user repeatedly asked to continue the PDF chronologically and corrected when adjacent follow-up suggestions displaced that work. The user also explicitly directed that the Bird connection be done at the end.

**How to apply:** Before each continuation, locate the next incomplete PDF item, check the current code for existing coverage, then build that item before proposing anything outside the PDF. Do not configure Bird or start SMS delivery until every other PDF milestone is complete; keep its task open in the meantime. Treat the sign-up phone value as unverified user input: never send messages or trust it for verification until the final SMS flow confirms that exact number.

The user explicitly skipped the Customer Community milestone.

**Why:** The user asked not to build it and to move on.

**How to apply:** Do not implement or reopen Customer Community unless the user asks. Continue with Wearable Integration next.

The user selected daily step totals and completed-workout counts only, with a provider-neutral privacy/data foundation before live health-platform connections.

**Why:** The user chose a foundation-first approach after learning Apple Health and Health Connect need native access beyond the current Expo Go preview.

**How to apply:** Keep health data private to the member, exclude heart rate, sleep, and location, and do not count wearable summaries toward fitness challenges. Implement Apple Health and Google Health Connect later in PDF order; do not claim a live sync until those integrations are built and tested.
