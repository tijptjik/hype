# Profile integration handoff (LLM 4)

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent #180; [Places/Features specification](../../../spec/breadline/proposal/01-places-features.md). Consumes contracts [1](01-contract.md), [2](02-contract.md), and [3](03-contract.md).

## Integrated behavior

`FeatureProfileEditor.svelte` accepts controlled `localeState` (`selectedLocales`, `visibleLocales`, `expanded`), `values`, `contextKey`, a nonmutating `translate(source, target, text)` provider, and `onTranslated(field, locale, text)`. Its children snippet receives `(field, canonicalLocale, onEditStart)`. Forward `onEditStart` to the inline descriptor so even starting an empty edit invalidates pending translation results. Source buttons are in each field header and include populated hidden locales. Targets are the snapshot of **all empty selected locales**, regardless of visibility; catalogue membership never becomes a translation target list.

`profileTranslation.ts` limits fanout to three requests per field, excludes locked fields, deduplicates active jobs, preserves successful targets after partial failure, and returns translated/unsupported/error/stale results per locale. It rechecks source text, edit revisions, target emptiness, lock state, and form context before applying each response. The next click retries remaining empties. Only successful updates set that field's machine flag. The provider contract remains LLM 2's `translateContentField`.

`FormI18nDescriptorFields` gains optional `inline` and `onEditStart`; legacy callers keep their existing layout. `FormI18nInlineRow` uses the existing TextInput/TextArea controls and sanitized HtmlPreview. Controls stay mounted and named during display/hidden states. Enter/Space opens editing, Escape restores the field and its verification flag, blur returns to display, and multiline Enter remains a newline. Verification stays a separate stable control; inherited rows cannot enter edit mode. The legacy `FormI18nTranslationBar` remains compatible with existing non-Profile consumers; Profile no longer uses its per-target actions.

The Feature route resolves Project → Organisation → user defaults, retains canonical form-local order/visibility through facets and development draft checkpoints, and appends existing populated locales deterministically. It uses `contentFormKey` for all Profile controls and never pins the UI language after reorder. Record changes/reset remount inline edit sessions and invalidate requests. Dynamic Location names are adapted without copying fallback languages; missing translations remain blank and locked. Full draft `data` (including property translations and flags) remains intact. The existing development-only/account/tab-scoped draft policy is retained; this does not introduce production draft persistence.

Profile toolbar presentation applies to Title and Description. Existing address and other legacy descriptor/property editors retain their own presentation contracts; their dynamic stored values are preserved by LLM 2's serializers and the complete draft payload. No backend/schema files or migrations were changed by this workstream.

## Verification

On 29 October 2026:

- `bun x vitest run src/tests/feature-profile-editor.test.ts src/tests/profile-translation.test.ts src/tests/dev-form-draft.test.ts src/tests/content-persistence.test.ts src/tests/locale-controls.test.ts src/tests/content-locales.test.ts src/tests/translation.remote.test.ts`: **94 tests passed in seven files**. Includes hidden targets, populated/other-field preservation, partial failure/retry, unsupported pairs, rejected calls, request bounds/deduplication, in-flight source/target/context changes, empty-row edits, inherited locks, rich-text Escape/blur, adding/registering another locale, HumanVerified, fourth-locale draft recovery, and reordered collapse.
- `bun run check`: **0 errors, 19 existing warnings in four unrelated files**.
- `bun scripts/visual-checks/feature-profile-check.ts` against `bun run dev -- --host 127.0.0.1 --port 4173`: Chromium and Firefox at **320, 390, 1440px**, zero page errors or horizontal overflow, matching display/input text positions, keyboard focus restoration, hidden-target bulk fill, reorder/recovery/collapse, and inherited Japanese title checks. The server was stopped after verification.
- Artifacts: `output/playwright/feature-profile/report.json` and twelve `*-editable.png` / `*-inherited.png` screenshots. Desktop and mobile screenshots were inspected. The provider is deterministic in this fixture; these are **UI fixture results**, not authenticated persistence evidence.

## Remaining acceptance for LLM 5

Browser inventory exposed no existing browser/session. Authenticated admin create/edit/save/reload, Advanced settings reload, and live provider execution remain **unverified**. Apply migration `0158_content_locale_settings.sql` through the authorized environment workflow before those checks; LLM 4 did not apply migrations. Use real Location-backed Japanese names to verify the complete server-to-Profile flow, and repeat an unrelated-field save with Japanese hidden and human verification unchanged. Reconcile the previously reported discovery-test failures separately; this focused run is not a full-suite claim. No commit, push, deployment, or public issue update was made.
