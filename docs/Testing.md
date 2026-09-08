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
test only when its behavior is retired or an equivalent assertion covers the same
failure at the same boundary. This audit does not establish that every individual
assertion is indispensable.

## Runner configuration

Node is the default environment. Files that use DOM APIs directly or through
their imports must start with `// @vitest-environment jsdom`. Keep browser-specific
coverage in that environment instead of adding browser globals to server tests.
Vitest 4 no longer supports `environmentMatchGlobs`; file directives remain explicit
and supported. Dependency inlining is retained: externalization increased import
time in this suite despite reducing transformation time.

File isolation and single-worker execution are retained. Increasing concurrency
requires a separate memory and shared-state assessment. Fake timer behavior and
the existing mocks are unchanged.

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

The image-import failure tests advance fake timers through the real inter-batch
delay. Feature and layer remote tests import their stateless handlers once per
file and reset mocked dependencies between cases instead of rebuilding the module
graph. Keep module resets in tests that actually depend on fresh module state or
change mocks with `vi.doMock`.
