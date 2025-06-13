
# Database Management

## Schema

The schema is defined in `src/lib/db/schema/*.ts`.

- The relationship between organisations, projects, layers and filters is hierarchical.
- Properties are defined on projects, and values are defined on properties.
    - Qualitative properties are shown to the users in a features info panel
    - Categorical properties are shown in a filter panel.
    - Layers control which filters are available to the user when that particular layer is visible.

## Migration

### Generate

To generate a migration based on the Drizzle schema changes, run

```shell
bun run db:migration:new <DESCRIPTION>
```

### Run

Migrate `local` database to the latest migration

```shell
bun run db:migration:run:local
```

#### Cloudflare D1

Migrations are run as part of deployments. However, you can also manually apply them:

Migrate `hype-db-prod` database on `cloudflare` to the latest migration

```shell
bun run db:migration:cf:prod
```

Migrate `hype-db-preview` database on `cloudflare` to the latest migration

```shell
bun run db:migration:cf:preview
```

## Seeding

These instructions are outdated, but kept for reference until a new protocol is finalised:

1. Export all tables from DataGrep, except for sqlite_sequence, sqlite_master and d1_migrations
2. Replace the instructions in `migrations/0001_data.sql` with the instructions from the export
3. Remove the latest migration from [Cloudflare D1](https://dash.cloudflare.com/a6eeace4b6d9f8e07ab307964e74d801/workers/d1) with Drizzle Studio. Use Google Chrome with the extension.
4. Run `bun run db:migrate:cf:prod`