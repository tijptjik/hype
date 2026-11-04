# LLM 4 — Profile layout and bulk empty-field translation

## Assignment

Implement the revised Profile experience in the
[shared specification](../Profile-Locales-Handoff.md). Consume LLM 1's resolver, LLM 2's
dynamic content/provider contracts, and LLM 3's toolbar. You are the sole implementation
owner of the Feature page integration.

## Ownership

Own FeatureProfileEditor, inline locale display/edit rows, FormI18nDescriptorFields and
FormI18nTranslationBar compatibility, the Feature route, form-local locale
order/visibility and draft recovery wiring, UI messages, and focused Profile tests.
Request backend/schema changes from LLMs 1–2 rather than editing their owned files
concurrently.

## Deliverables

- Prefix non-user locales inline; remove guide lines and stacked labels;
  click-to-edit/blur-to-display with stable alignment, keyboard behavior, and
  rich-description preservation.
- Improve spacing, shorten help to “Name follows Location.”, retain HumanVerified and
  inherited-title protection/Edit Location.
- Wire defaults, dynamic locales, reorder, visibility, and draft restoration across
  fields. Do not force the user locale back to first after a reorder.
- Header “From” source buttons only for populated field values. Clicking one source
  fills **all empty selected locale values for that field, including hidden locales**.
  Never use active-row targeting. Never translate every language in the catalogue.
- Bounded fanout, per-target results/errors, retry remaining empties, supported-pair
  handling, machine flags only for successful updates, and stale-response/user-edit
  protection. Preserve every populated target and all other fields.

## Done when

Focused tests prove multi-target translation (including a hidden target), untouched
populated values/other fields, partial success/retry, in-flight edits/source changes,
and locked-field exclusion. Verify dynamic fourth-locale draft recovery and field
registration. Inspect desktop/mobile screenshots and keyboard flows; inherited titles
remain locked in display and edit states. Hand integration scenarios and artifacts to
LLM 5.
