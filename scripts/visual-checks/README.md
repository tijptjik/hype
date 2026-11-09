# Manual visual checks

This directory contains manual browser regression checks and active acceptance
investigations, including checks originally preserved from `output/playwright/`. Run
them from the repository root through `dev-check`. They are not a portable or
automatically executed test suite: inspect their local URLs, browser paths and fixture
dependencies before reuse.

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
