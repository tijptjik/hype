Property import fixtures:

- `import-property-reconciliation-scenarios.csv`
  Covers the common mixed flow:
  new property creation, matched categorical matching, freeform enrichment, and toggle creation.

- `import-property-reconciliation-all-components.csv`
  Adds complete locale coverage for `synopsis` and a matched numeric `grade` property so the
  property flow can hit:
  `PropertyCreationStep`, `PropertyTranslationPrompt`, `PropertyDataEnrichment`,
  `PropertyValueMatching`, and `PropertyRangeValidation`.

- `import-property-reconciliation-range-validation.csv`
  Forces `PropertyRangeValidation` to stay visible by sending non-numeric values into the
  existing `grade` `RangeField`.

Component visibility rules:

- `PropertyCreationStep`
  Appears for new properties:
  categorical scenarios 1 and 2, and freeform scenarios 5 and 6.

- `PropertyTranslationPrompt`
  Appears only for scenario 7:
  an existing matched freeform property with locale columns for all supported locales,
  before a translation-choice decision has been stored.

- `PropertyDataEnrichment`
  Appears for existing matched freeform properties after the translation choice is known,
  or immediately when the locale set is incomplete.

- `PropertyValueMatching`
  Appears for existing matched categorical properties in scenarios 3 and 4 when the matched
  property component is not `RangeField`.

- `PropertyRangeValidation`
  Appears for existing matched categorical properties in scenarios 3 and 4 when the matched
  property component is `RangeField`.
  Valid numeric data may auto-advance quickly, so use
  `import-property-reconciliation-range-validation.csv` when you want the screen to remain visible.

Fixture prerequisites:

- `genre`, `country`, `synopsis`, `author`, and `grade` must already exist in the selected
  project scope or inherited visible scope so the import resolver matches them instead of
  treating them as new properties.
- `grade` must resolve to a `RangeField`; otherwise the matched categorical flow will render
  `PropertyValueMatching` instead of `PropertyRangeValidation`.
