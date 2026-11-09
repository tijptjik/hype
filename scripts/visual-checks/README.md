# Manual visual checks

This directory contains manual browser regression checks and active acceptance
investigations, including checks originally preserved from `output/playwright/`. Run
them from the repository root through `dev-check`. They are not a portable or
automatically executed test suite: inspect their local URLs, browser paths and fixture
dependencies before reuse.

## Shared runner and suites

Changelog, profile/locale, task-review and messaging checks share
`lib/browser-cases.ts`. It runs Chromium then Firefox headlessly and closes each browser
on success, failure or early termination. Map scenarios explicitly opt into Chromium's
local CORS workaround. Existing engine filters, per-scenario page options, mocks,
assertions and artifact names remain local to each check.

List the suite contents without launching browsers:

```sh
bun scripts/visual-checks/run.ts --list
```

Run one suite, several suites, or individual checks under one managed validation scope:

```sh
dev-check bun scripts/visual-checks/run.ts changelog
dev-check bun scripts/visual-checks/run.ts profile-locales messaging
dev-check bun scripts/visual-checks/run.ts staff-save-check shared-locale-tabs-check
```

The four suite names are `changelog`, `profile-locales`, `task-review` and `messaging`.
Each scenario runs in a separate Bun process, sequentially, with inherited environment
variables. Duplicate selections run once; unknown selections fail before any check
starts, and the first failed check stops the suite. There is no implicit run-all.
Original direct commands still work.

The suite launcher does not start a server or normalize existing origin variables.
Inspect the selected checks' local URLs and overrides (`HYPE_CHECK_ORIGIN`,
`FEATURE_CHECK_URL`, `CHANGELOG_CHECK_URL`, etc.) before running a suite. Some checks
still use fixed local URLs. Synthetic fixtures do not establish authenticated mutation
acceptance, and retaining a scenario in a suite does not certify that it currently
passes.

The runner's unit tests use fake engines and do not launch browsers:

```sh
dev-check bun test scripts/visual-checks/lib/browser-cases.test.ts scripts/visual-checks/run.test.ts
```

Scripts may require a running development server or a temporary fixture. The rendering
scripts can write to development asset storage using environment credentials; inspect
their target before running them. Retention does not mean a script has recently passed.

The [repository script review](../README.md) records the 9 November 2026 cleanup. Keep
the address/location/discovery checks for current reconciliation work; task,
contribution, history and permission checks for mutation acceptance; and map, scrolling,
locale, messaging, sharing and loading checks for recurring regressions. Their
supporting fixtures and libraries remain relevant even without package commands.
Screenshot-only checks can still cover useful visual behavior; lack of assertions alone
is not a reason to remove them.

Use `bun run render:map:styles` through `dev-check` for standard map-style previews.
Inspect its storage/stage options before execution. The old fixed-location Breadline
experiments and ad hoc preview uploaders were removed in favour of the standard renderer
and retained map regression checks.

Prefer headless execution. Visible test windows must launch silently on workspace 7; use
the existing authenticated browser session for admin verification. Start a server only
if needed, using the managed package launcher, and stop only the server you started.

Keep authored scripts and harnesses here. Write generated screenshots and logs to the
ignored `output/playwright/` directory, creating that directory as needed. Durable
design references and review boards belong in `docs/design/`.
