---
name: Localization boundaries
description: Language, timezone, and linguistic release constraints for MaydanGo.
---
Use Sorani Kurdish for the Arabic-script Kurdish experience and Iraqi Arabic for Arabic content. Keep schedules in Iraq time even if the viewer is abroad. Translation drafts require qualified native-speaker review before release, especially exercise safety and neutral eligibility language.

MaydanGO customer-facing copy should use a friendly Iraqi Arabic, Erbil Sorani, and US English voice. Keep the meaning aligned across all three, particularly around check-in versus entry and safety instructions.

**Why:** The product serves people across Iraq, and automatically generated translations and web-only visual checks cannot establish linguistic accuracy or native-device RTL quality.

**How to apply:** Do not claim linguistic certification from automated coverage checks. Preserve account input, catalog IDs, and API enum values; localize presentation rather than changing persisted identities or membership entitlements.

**Why:** The user approved this language direction and the attached suggestion set with consistency and safety fixes.

**How to apply:** Use this voice for future MaydanGO customer copy while keeping claims and safety guidance semantically consistent across languages.

Approved-copy PDFs can contain right-to-left text-layer artifacts, including duplicated letters, misplaced diacritics, and reversed Sorani phrase order. Automated repairs may leave or introduce these errors.

**Why:** The revised MaydanGo PDF's extracted Arabic contained duplicated alifs and displaced marks, while an automated Sorani repair reversed a visible phrase.

**How to apply:** Render representative Arabic and Sorani PDF pages and compare their visible wording and order before importing extracted strings. Counts and automated checks do not establish linguistic accuracy; native-speaker review remains required.

The website wording review export is a source snapshot, not approved copy: it marks its Arabic and Sorani entries “Review pending,” asks for review before website changes, and excludes the signed-in partner portal.

**Why:** The document distinguishes unreviewed public-site wording from the partner portal’s additional English-only messages.

**How to apply:** Public-site review exports must stay out of released copy until qualified review. Keep the separately uploaded app copy scoped to the mobile operations area and in draft status pending local-speaker review.

The user clarified that the revised English, Iraqi Arabic, and Sorani copy upload is intended for the Expo app's partner/admin operations area, despite its partner-portal filename.

**Why:** The user corrected a scope assumption that had put the uploaded copy on the website instead of the mobile app.

**How to apply:** Scope this copy to the mobile operations area, keep it as a review draft, and do not treat it as native-speaker approval or release authorization.

Expo can emit a React Native DevTools warning about missing `libglib` while Metro and the browser preview still run successfully.

**Why:** This occurred in the Linux workspace during a localization preview; it did not prevent the web bundle from rendering.

**How to apply:** Treat this warning as optional tooling unless Metro startup or the preview itself fails; a browser preview still does not count as native-device verification.
