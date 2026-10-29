# Website copy review reconciliation

## Scope and source

The user selected `MaydanGo_Copy_Review_Revised_1793285215392.pdf` as the source for the public website. This review contains 166 entries for each language. It replaces the original task's mobile-app scope for this pass; no mobile-app copy was changed.

The revised website copy is already active in `src/approved-copy.json`. `src/App.tsx` merges those approved entries over the legacy defaults for English, Iraqi Arabic, and Sorani, so no wording changes were needed after reconciliation.

## Coverage

| Language | Revised | Kept | New | PDF entries | Approved-copy keys | Missing / extra keys |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| US English | 81 | 85 | 0 | 166 | 166 | 0 / 0 |
| Iraqi Arabic | 126 | 10 | 30 | 166 | 166 | 0 / 0 |
| Sorani Kurdish | 109 | 27 | 30 | 166 | 166 | 0 / 0 |

The English wording was checked against the PDF text. Arabic and Sorani PDF text extraction does not reliably preserve right-to-left reading order, so the rendered PDF—not extracted character order—was used for those comparisons. Representative navigation, legal, partner, offerings, sign-up, and not-found entries were checked in the rendered review and against the active translations.

The live website home page was captured in all three languages. English renders left-to-right; Arabic and Sorani render right-to-left, set the document language correctly, and show the approved region, movement, navigation, hero, and footer wording.

## Safety and dynamic content

- The copy continues to state that the website does not take payments, sell memberships, activate access, or guarantee a place.
- Contact-form wording still explains that messages are not sent or stored by the site.
- Legal copy remains explicitly an informational draft, not legal advice, and does not claim lawyer review or approval.
- Existing dynamic plural handling and partner-supplied offering content were not changed.

## Not covered by this website review

- The three app-specific PDFs named in the original task were not supplied in the selected review. Native-app wording therefore remains outside this reconciliation.
- The website copy export does not include additional English-only controls and messages inside the signed-in partner operations portal. Those need a separate copy review if that portal is in scope.
- Partner-provided offering titles and descriptions are dynamic content, not entries in the fixed website translation catalog.
