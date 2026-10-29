# LLM 5 — Integration and acceptance

## Assignment

Validate the integrated work against every acceptance criterion in the [shared specification](../Profile-Locales-Handoff.md). Prepare scenarios early, but final acceptance depends on LLMs 1–4. Do not independently rewrite their implementation while they are editing it.

## Ownership

Own cross-workstream integration tests/fixtures, browser evidence, final technical documentation and tracking updates. Route failures to the responsible LLM with a reproducible case; take ownership of a fix only after an explicit file handoff.

## Required end-to-end scenarios

1. Organisation ordered defaults → Project inheritance → explicit override → reset → reload; verify authorization and untouched unrelated settings.
2. User default orders for English, both Chinese scripts, and no locale; configured order wins.
3. Add Japanese, edit values, verify a field, hide it, reorder it above the user locale, change facets, recover draft, save and reload without losing content/provenance.
4. Choose a populated description source: fill every empty selected target, including hidden ones, preserving populated descriptions and all titles. Exercise partial provider failure/retry and typing into a target while a response is pending.
5. Location-derived fourth-locale title stays read-only, changes through Edit Location, and retains existing separate-name/parent-policy behavior.
6. Chromium and Firefox at desktop/390px/320px: prefix alignment, display/edit stability, header translation, toolbar wrap/reorder, focus, reduced motion, no essential label truncation.

## Done when

Run appropriate focused/integration checks and authenticated admin save/reload. Report pre-existing failures separately, including unresolved discovery failures; fixture screenshots are not persistence proof. Update the Places/Features domain document and #194/#180 tracking with concrete evidence, retaining unchecked acceptance where unverified. Final report lists what passed, outstanding limitations, and review artifacts. No commit/push/deploy without authority.
