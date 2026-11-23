# Ghost Signs Stratigraphy cardinality

The initial production taxonomy migration on 23 November 2026 retains single-select
storage. It mapped 133 classified source assignments into 164 assignments across
Completeness (55), Stratigraphy (16), Material (60), Substrate (28) and Technique (5).
Condition remains unassessed. Empty values and TBD markers are null. No hand-painted
technique or paint material was inferred from ambiguous labels.

`enable-multi-select.sql` is the later, ordered cardinality migration. Run it only after
the initial taxonomy is present, migration `0263_multi_select_classifiers.sql` is
installed, and the application supporting multi-select is deployed to the target. It is
deliberately pending rather than automatically widening production fields before
compatible application code is available.

The migration finds the stable Stratigraphy property `af38c4209f82` in project
`YuSFnia9VOtG`, checks its classifier contract and catalogue history, records the
catalogue revision, and changes cardinality to `many`. Existing Feature assignments and
Feature revisions are untouched: legacy singleton selections remain valid. The migration
is repeatable once applied and fails if the prerequisite property or multi-select
storage guards are missing. Execute the complete file atomically.

Multi-select values use `featureProperty.valueJson` with
`{"version":1,"propertyValueIds":["option-id", "another-option-id"]}`. IDs are unique,
sorted on write and belong to the property. Empty selections use SQL NULL. Removing an
option removes just that option from each collection and captures the corresponding
Feature history; historical option labels remain in immutable revisions.

## Verification

`dev-check python3 scripts/dev/test_multi_select_classifiers.py` passes five focused
SQLite tests, including malformed/cross-property selections, cascade preservation,
contract narrowing, unchanged singleton rows, catalogue revisions and migration replay.

Vitest tests cover selection serialization, authoritative validation, widening, revision
option context and the multi-select component interaction. The managed Vitest,
typecheck, lint and Chrome jobs could not start on 23 November 2026 because Li had no
reachable SSH address. These application checks remain required before rollout; the SQL
rehearsal alone does not establish application interaction correctness.
