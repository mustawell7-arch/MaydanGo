---
name: MaydanGo PDF sequencing
description: Keep ongoing MaydanGo work aligned with the user's uploaded product requirements PDF.
---

When the user says to continue MaydanGo work, identify and implement the next unfinished item from the uploaded product PDF in document order. Do not substitute agent-invented follow-up work for a PDF requirement. Keep payment implementation for the final stage, and leave end-to-end/device tests and check-in radius testing until the end as the user directed. Keep the Bird SMS connection open and untouched until all other PDF milestones are complete.

**Why:** The user repeatedly asked to continue the PDF chronologically and corrected when adjacent follow-up suggestions displaced that work. The user also explicitly directed that the Bird connection be done at the end.

**How to apply:** Before each continuation, locate the next incomplete PDF item, check the current code for existing coverage, then build that item before proposing anything outside the PDF. Do not configure Bird or start SMS delivery until every other PDF milestone is complete; keep its task open in the meantime. Treat the sign-up phone value as unverified user input: never send messages or trust it for verification until the final SMS flow confirms that exact number.

The user explicitly skipped the Customer Community and Third-party wellbeing apps milestones.

**Why:** The user asked not to build it and to move on.

**How to apply:** Do not implement or reopen either item unless the user asks.

The user selected daily step totals and completed-workout counts only. Apple Health and Android Health Connect now use the same manual, read-only summary flow; native phone validation remains for the final test phase. Direct third-party wellness-app integrations are a separate PDF item.

**Why:** The user chose a foundation-first approach, limited wearable data to steps and workout counts, and deferred device tests until the end.

**How to apply:** Keep health summaries private, exclude heart rate, sleep, and location, and never count imported summaries toward challenges. Do not reopen third-party app integrations unless asked. Do not claim either OS integration is device-verified until final native phone testing.

The PDF's Middle East expansion milestone names no countries. The user dismissed the country-selection question, so no expansion market has been chosen.

**Why:** Country-specific cities, currency, time zones, legal rules, and membership access should not be invented.

**How to apply:** Preserve Iraq as the only configured market until the user names an expansion country. Continue with later independent PDF items when possible.
