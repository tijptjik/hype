# Repository scripts

Use package commands where available. Run heavy validation and every browser check
through `dev-check`; use `dev-server` for long-lived development servers. Inspect a
script's arguments and targets before running it, especially migration, storage and
deployment tools.

## Retention review (9 November 2026)

Reviewed the inventory and repository references of 456 authored files under `scripts/`
(including tests, supporting modules, fixtures and assets), plus package/worker build
scripts, SQL shell helpers and Git hooks. Ignored environments, caches, exports and
generated artifacts were excluded. Open GitHub issues were checked live. This was a
static relevance review, not execution or certification of every retained script.

Nineteen unchanged, tracked files were removed. Existing untracked work was retained.
Absence from `package.json` alone is not grounds for deletion: manual acceptance checks,
recovery tools and imported helpers often have no package command.

### Keep: recurring workflow or outstanding acceptance

| Area                                                                     | Reason to retain                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `breadline/` (except the removed generator below)                        | Source synchronization, backup, repeatable import, identity decisions, attribution and cutover rehearsal. Issues #189, #191–#194 and #225 remain open; see `spec/breadline/proposal/02-user-import.md` and `03-migration.md`.                                                                                    |
| `locations/`, `addresses/`                                               | Address reconciliation, identity/placement acceptance, lifecycle and kind fixtures, source mirroring and migration rehearsals. Keep libraries, tests and review UI together. Issues #194 and #233; see `spec/breadline/proposal/01-places-features.md` and `docs/refactor-guides/Location-Lifecycle-Rollout.md`. |
| `revisions/`, `dev/feature-lifecycle/`                                   | Local recovery for historical exports and separately reviewed data packages. See `docs/operations/Revision-Deployment.md`.                                                                                                                                                                                       |
| Remaining `dev/`, `dev-check.sh`, `dev-server.sh`, `local-dev/`          | Local personas, rebuild/export/restore, mock data, browser-update handling, media qualification and performance diagnostics. Includes the untracked user reconciliation tool and its tests.                                                                                                                      |
| `visual-checks/`                                                         | Reusable browser regression checks, fixtures and active acceptance investigations. See its README. Issues #177 and #223 still require browser verification.                                                                                                                                                      |
| `checks/`, `verify-sveltekit-patch.ts`                                   | Formatting, staged lint, startup diagnostics and dependency patch checks.                                                                                                                                                                                                                                        |
| Top-level backfills, generators and `sync-map-styles.ts`                 | Package-backed rendering, spatial/division/MTR indexing, image hashes, schema documentation, test images and reproducible textures.                                                                                                                                                                              |
| `maps/`, `routing/`, `geocoding/`, `benchmark-resource-breadcrumbs.ts`   | Reproducible map data, shared routing configuration and documented benchmarks; routing issue #213 remains open.                                                                                                                                                                                                  |
| `messaging/`, `dev/telegram-turn/`                                       | Worker launchers, phone lookup backfill, rebuild integration and loopback media qualification.                                                                                                                                                                                                                   |
| `images/`, `eln/`                                                        | Documented capture/recovery planning, ELN ingestion and reviewed venue identities; retain data and tests with their consumers.                                                                                                                                                                                   |
| `i18n/`, `find-unused-translations.js`, `find-duplicate-translations.js` | Content-locale audits and repeatable translation maintenance.                                                                                                                                                                                                                                                    |
| `cloud/`                                                                 | Deployment/domain/auth configuration, storage migration, asset probes and maintenance utilities. Some are historical recovery tools; see below.                                                                                                                                                                  |
| Package/worker `scripts/`, `.husky/`, SQL shell helpers                  | Build, validation, hook and database maintenance entry points. SQL export/restore helpers are still referenced by package commands. Older SQL diagnostics need inspection before reuse.                                                                                                                          |

### Keep provisionally: retirement is not established

These are not recommended everyday commands. Their lack of callers does not establish
that the recovery or provenance they preserve is disposable:

- `offboarding/prepare-farmthecity.py`: scoped export/rehearsal for migration 0099.
  Local completion does not establish every target has completed offboarding.
- `cloud/probe-hkghostsigns-r2-cutover.ts`,
  `cloud/backfill-hkghostsigns-cloudinary-survivors.ts` and
  `cloud/migrate-r2-images-to-asset-raw.ts`: retain until legacy-media recovery and
  deployment retirement are established. The resource-revision documentation still
  distinguishes repaired originals from unknown historical metadata.
- `cleaning/*.ipynb` and `pyproject.toml`: legacy Ghost Signs source preparation and its
  environment definition. These may preserve authored transformation/provenance logic;
  this review did not establish an equivalent replacement.
- `visual-checks/check-phone.ts` and `PhoneHarness.svelte`: the check references a
  missing `src/tests/fixtures/PhonePropertyHarness.svelte`. Retain the authored harness
  pending repair of the fixture wiring; the browser check is currently incomplete.
- Older visual diagnostics with local URLs or browser paths: retain their distinct
  regression coverage, but inspect and adapt prerequisites before running them.

### Removed: obsolete or superseded one-offs

| Removed paths                                                                                                           | Evidence / replacement                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visual-checks/breadline-{label-search,landmarks,overlaps,placement-debug,preview,streets,walkway-options,walkways}.ts` | Fixed-location screenshots and colour/label experiments, with no repository callers. Standard map-style rendering and current map registration, viewport and adaptive-marker checks remain. Historical screenshots are untouched. |
| `visual-checks/render-featured-styles.ts`, `visual-checks/render-missing-style-previews.ts`                             | Ad hoc development-bucket preview writers superseded by `generate-map-style-renders.ts` / `bun run render:map:styles`, which expose storage and stage selection.                                                                  |
| `visual-checks/check-neon.ts`, `visual-checks/check-waves.ts`                                                           | Screenshot experiments tied to a pinned browser binary and generated Vite dependency paths. Retain the broader theme/profile checks.                                                                                              |
| `breadline/generate-migration.ts`                                                                                       | Hard-coded authoring script for the already-versioned `0085_breadline_users.sql`; rerunning would overwrite that migration using today's schema. Retain migration 0085 and normal migration commands.                             |
| `dev.sh`                                                                                                                | Unreferenced launcher starts Vite directly and a remote asset worker. Current package launchers use the managed `dev-server` scope and explicit asset-service commands.                                                           |
| `patches/drizzle.patch`                                                                                                 | Unreferenced patch not registered in `package.json` patched dependencies.                                                                                                                                                         |
| `fixes/fix_backup_column_order.sh`                                                                                      | Unreferenced repair hard-codes old table column orders. Current D1 export/restore retains schema metadata and explicit canonical exports.                                                                                         |
| `scraping/download-images.py`, `scraping/download-images.sh`, `fixes/fix-new-images.py`                                 | Unreferenced download/ID-repair utilities pinned to the 5 June 2025 Ghost Signs CSV. Source files, notebooks and image evidence remain intact.                                                                                    |

Before removal, filename and extensionless-path searches found no remaining references
to these files. No migration, database, storage operation or browser check was executed.
Retained scripts are not all portable or passing simply because they remain relevant.
