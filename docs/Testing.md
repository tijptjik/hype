# Test suite maintenance

Run the complete suite with `bun run test:run` before pushing. For a focused
iteration, pass a filename: `bun run test:run src/tests/feature.services.test.ts`.
Use `bun run test:watch` for repeated local edits so compilation and worker startup
are amortized. The full suite remains the pre-push and CI gate.

## Coverage to retain

- Authorization matrices check roles, resource scope, and field permissions.
  Remote API tests separately check that handlers apply those decisions and shape
  responses correctly; mocked authorization in a remote test cannot replace a
  policy test.
- SQLite transaction tests execute generated SQL and verify stale-write guards,
  ownership checks, and rollback. Mocked service calls cannot establish atomicity.
- Migration tests verify transformations of existing data, which current schema
  and service tests do not cover.
- Client state tests check asynchronous response ownership and stale updates;
  rendered component tests check interaction and visible behavior.
- Utility, schema, import, and map tests protect normalization and boundary cases.
  Similar test names across these layers do not establish redundant coverage.

No tests were removed during the September 2026 runner optimization. Remove a
test when its behavior is retired, an equivalent assertion covers the same
failure at the same boundary, or it merely repeats cosmetic implementation
constants without checking a functional contract. Preserve accessibility and
layout behavior even when their assertions involve styles.

## Runner configuration

Node is the default environment. Files that use DOM APIs directly or through
their imports must start with `// @vitest-environment jsdom`. Keep browser-specific
coverage in that environment instead of adding browser globals to server tests.
Vitest 5 does not support `environmentMatchGlobs`; file directives remain explicit
and supported. Dependency inlining is retained: externalization increased import
time in this suite despite reducing transformation time.

File isolation is retained with a maximum of two workers. This bounds the memory
cost of Svelte/DOM imports while allowing independent files to overlap. Use
`--maxWorkers=1 --no-fileParallelism` on memory-constrained machines. Fake timer
behavior and the existing mocks are unchanged; DOM matchers load only in DOM
environments. Ignored `.local/` probes are excluded because they may depend on
machine-specific databases. Run those manually with a dedicated configuration.

Test scripts still generate translations before running Vitest. They no longer
call the operating system `sync` command: flushing disk buffers is unnecessary
for the next process to read generated files.

## September 2026 measurements

All 133 files and 1,428 tests passed before and after the change. Observed Vitest
duration fell from 95.36s to 68.25s, with environment setup falling from 25.54s to
2.34s. These are local single-run observations, not a controlled benchmark or CI
guarantee; the initial baseline overlapped part of an exploratory run. An
externalized-dependency run passed in 91.67s and was not retained. Durations exclude
the preceding i18n compilation and shell `sync` command.

## Profiling individual tests

Capture assertion durations with
`bun run test:run --reporter=json --outputFile=/tmp/hype-test-durations.json`.
Inspect `testResults[].assertionResults[].duration` for cases over 250ms. These
durations include per-test hooks but exclude static module imports, so compare
overall runtime as well before claiming a suite-wide speedup.

## October 2026 cleanup

Removed five redundant translation checks (presence, non-empty files, depth,
local test-map keys, and diagnostic coverage). The retained non-empty reference
key list, exact cross-locale key equality, and empty-value checks cover the useful
invariants without repeated scans or quadratic missing/extra-key searches.
Removed six map palette snapshots that only repeated literal colors; retained
map behavior, source/filter/locale checks, cloning, and theme contrast coverage.

The original serial run passed 1,895 tests in 67.21s; two workers alone passed in
38.39s. After cleanup, all 201 portable test files and 1,883 tests passed in 40.15s.
The difference in test count is 11 removed tests and one excluded `.local/`
database probe. These are local single-run observations, excluding translation
compilation, and do not establish a speedup from the assertion cuts themselves.
The measured wall-time gain is primarily from bounded file parallelism.

A final run through `bun run test:run --sequence.shuffle --sequence.seed=178`
also passed all 1,883 tests: 27.77s in Vitest and 30.60s for the command including
translation generation. Sampling the entire command process tree every 250ms
observed a peak summed RSS of 1,804.8 MiB (shared pages may be counted more than
once). Shuffled order provides an additional check for leaked mock/module state;
it does not prove every possible ordering. The separate `bun run breadline:db:test`
suite passed all 31 tests across four files.

The image-import failure tests advance fake timers through the real inter-batch
delay. Feature, layer, user, hub, image, property, translation, and organisation
remote tests import their stateless handlers once per file and reset mocked
dependencies between cases instead of rebuilding the module graph. Keep module resets in tests that actually depend on fresh module state or
change mocks with `vi.doMock`.
