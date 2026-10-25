# Localization release checks

The customer app supports English, Arabic (Iraq), and Sorani Kurdish (`ku` in saved preferences, `ckb-IQ` for Intl). Catalog IDs, API enum values, QR references, and entered account data must remain unchanged by translation.

`lib/i18n.ts` holds keyed UI messages; `lib/content.ts` and `lib/interface-copy.ts` hold source-phrase translations for the sample catalog and account interface. `components/Localized.tsx` is the presentation boundary for authored copy, numbers, accessibility labels, and directional icons. Use its `raw` prop for user-generated text and identifiers; never translate arbitrary personal data. Courses retain their existing trilingual title/lesson objects.

Dates from the API use `Asia/Baghdad`, not the viewer's device timezone. The catalog's relative day/time strings are illustrative only. Membership prices use IQD without fractional digits. Persisted language changes are serialized to avoid out-of-order native storage writes. Screen content waits for preferences to load.

## Automated verification

- `node artifacts/maydango/scripts/localization.test.cjs`
- `pnpm --filter @workspace/maydango typecheck`

These check translation completeness of catalog fields, lesson coverage, locale numbers/currency/dates, neutral eligibility distinctions, and safe localized error handling. The optional `--audit` flag reports unmatched literal JSX copy (HTML entities may be reported even when correctly decoded at render time).

## Required before release

Qualified Iraqi Arabic and Sorani native speakers must review **all** translations, including existing course lessons, exercise safety guidance, eligibility wording, names/transliterations, and account error messages. These are draft translations, not a certified linguistic review.

On physical iOS and Android devices, review all three languages at large text sizes: language selection and cold restart, facility and event discovery/search, course lessons, membership prices, account errors, and booking/cancellation dates. Check native tab ordering, screen-reader announcements, mirrored navigation icons, mixed-direction email/date input, and long text wrapping. Web preview and automated checks are not a substitute for this native release check.
