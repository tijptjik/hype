# Application deployment

Pushes to `preview` deploy to preview after the build and test jobs pass. Pushes to
`main` deploy to production. CI runs the same command available from the repository
root: `bun run deploy:preview` or `bun run deploy:prod`.

Each command builds the selected environment, applies its pending numbered D1 migrations
with Wrangler, deploys the asset service and the division and location refresh Workers,
then deploys the application. A failed step stops the sequence. Wrangler uses the target
database's migration ledger. Put new schema changes in top-level numbered SQL files
under `migrations/`. A retry skips migrations already recorded by D1.

Remote preview still had the legacy Feature schema and 115 migration entries on 24
November 2026. Its deploy command first reads `feature.currentRevisionId` with a
zero-row query. An older database stops there, before any migration runs. Automatic
preview deployments can proceed once its database has the current schema. Production
already has that schema.

The application deploy uses the configuration generated alongside the built Worker and
merges in the live [Hub domain assignments](../Hub-Domains.md). CI uses
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the target environment.

The [November cutover record](Preview-to-Production-Cutover.md) describes the completed
production transition. Local recovery from older exports and separately reviewed data
packages have their own entry points.
