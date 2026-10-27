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

## Verification record — 2026-10-25

**Release status: native verification pending, not approved.**

- Localization script: passed (1,126 translated phrases and catalog fields).
- Preferences script: passed language persistence, cold hydration, rapid changes, and invalid-data recovery using mocked React hooks and storage. This is not a physical cold-restart test.
- `pnpm --filter @workspace/maydango typecheck`: failed with 38 errors in six files (`app/account.tsx`, `app/checkin.tsx`, `app/live.tsx`, `app/session/[id].tsx`, `components/AttendanceCard.tsx`, and `hooks/useMemberBookings.ts`). Errors include missing shared API-client exports and implicit parameter types. No application code was changed during this verification.
- Device access: the available workspace is Linux; Android `adb` is unavailable and `xcrun --find xctrace` reports no developer root. No physical-device results were obtained.
- Separate English-source review PDFs have been prepared for Iraqi Arabic and Sorani, covering 672 existing localized entries per language across interface messages, account/system copy, catalog phrases, cities, courses, lessons, and translated coaching slots. Native-speaker approval and corrections are pending; these PDFs do not replace the physical-device checks below.
- The user approved applying the attached English, Iraqi Arabic, and Sorani suggestions with consistency and safety fixes. Selected app, account, booking/check-in, membership, facility, and exercise copy has been updated: check-in wording now means recording arrival (not entering), the map launch note is hidden, visible visit/spot counts include their numbers, the sharp/painful-sensation stop instruction is retained in all three languages, and the optional doctor-advice sentence was not added. The remaining suggestion rows have not all been reconciled against the app source, so do not treat the PDFs as fully implemented.
- Automated localization checks pass after these copy updates. Physical iOS/Android verification is still pending; the user-approved wording does not replace testing navigation, accessibility, text scaling, native input direction, or cold-start language persistence on devices.
- Recheck after the copy changes: localization and mocked preference-persistence scripts passed. The mobile typecheck still reports 38 errors in the same six files; the API typecheck reports 51 errors in six files, including missing `@workspace/db` exports. The API workflow builds and listens, and the Expo web preview bundles despite an optional React Native DevTools `libglib` warning. The screenshot showed English only and is not device verification.

| Physical platform | Arabic | Sorani | Device / OS / build / tester / evidence |
| --- | --- | --- | --- |
| iOS with native liquid-glass tabs | Not run | Not run | Pending |
| Supported older iOS with classic tabs | Not run | Not run | Pending |
| Android with classic tabs | Not run | Not run | Pending |

### Physical-device procedure

Record device model, OS version, app build or source revision, runtime (Expo Go or installed build), system language, text-size setting, test date, and tester with each result. Do not include personal account details in evidence. Run each step separately for Arabic and Sorani; use English as the baseline and repeat with the device system language different from the app language.

1. Select the language in the app, leave the settings screen, fully terminate the app, then reopen it without clearing its storage. Confirm the selected language, translated tabs, and RTL content persist. Repeat after switching rapidly between languages, ending on the language under test.
2. Visit every tab. Confirm Home is at the RTL leading edge, labels match their destinations, selection stays correct, and back icons and navigation transitions have the appropriate direction. Check native iOS tabs separately from classic iOS/Android tabs; the native tab branch does not receive the classic tab bar's explicit direction style.
3. Open facility details and discovery/search; check long names, locations, filters, schedules, and action buttons. Open booking details and cancellation confirmation using a designated test account and test reservation only. Check Iraq-time dates, statuses, and reference strings without cancelling a real reservation.
4. Open membership: check long plan descriptions, quota rows, IQD prices, selected state, and sample-only notice. Open course details and lessons: check titles, paragraphs, lesson controls, and progress labels.
5. Repeat the screens at default and the largest supported accessibility text size. Confirm text is not clipped or overlapping, buttons remain readable and reachable, and scrolling reaches all content above the tab bar.
6. Enable VoiceOver on iOS or TalkBack on Android. Traverse tabs, headers, icon-only controls, inputs, and actions. Confirm localized accessible names, selected/disabled states, logical focus order, and that no action can only be identified visually. Record the installed speech language/voice separately from the app language.
7. In email inputs, enter a synthetic address such as `rtl.test+1@example.com`; check caret movement, selection, punctuation, editing, and keyboard visibility. Check native date controls where present and mixed Arabic/Sorani date labels, numerals, and booking references. Values must not change during language switches. Mark a date-input check not applicable only when the tested flow has no editable date field.
8. Record pass/fail for each step with sanitized screenshots or recordings. For a failure, record route, exact reproduction steps, expected and actual behavior, and affected device/language. Fix confirmed defects and repeat the affected checks on both platforms before approving release.

This checklist is preparation for device verification, not evidence that the checks have run. Physical results and any resulting fixes are still required.
