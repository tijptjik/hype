# Resource Type Refactor Guide

## Goal

Move resource-specific TypeScript types out of [`src/lib/types.ts`](/home/io/code/hype/src/lib/types.ts) and colocate them with the resource schema that defines their contract.

This reduces drift between:

- Drizzle schema
- Zod schema
- DB service row shapes
- API response profiles
- client form payloads

## Current Pattern

For each resource:

1. Keep runtime Zod schemas in `src/lib/db/zod/schema/<resource>.ts`.
2. Add colocated resource types in `src/lib/db/zod/schema/<resource>.types.ts`.
3. Import resource-specific types directly from that local `*.types.ts` file.
4. Do not re-export those new resource types from [`src/lib/types.ts`](/home/io/code/hype/src/lib/types.ts).
5. Leave only genuinely shared, cross-resource, or app-wide types in [`src/lib/types.ts`](/home/io/code/hype/src/lib/types.ts).

## Project Example

The `project` refactor now uses:

- schema: [`src/lib/db/zod/schema/project.ts`](/home/io/code/hype/src/lib/db/zod/schema/project.ts)
- colocated types: [`src/lib/db/zod/schema/project.types.ts`](/home/io/code/hype/src/lib/db/zod/schema/project.types.ts)

That local type file owns:

- DB row types
- form input types
- remote query param/profile types
- profile-mapped query row types
- project role/i18n helper types

## Query Row Pattern

Prefer profile-aware row types instead of a single catch-all raw type.

Example shape:

- `ProjectListDBRaw`
- `ProjectCardDBRaw`
- `ProjectAdminDBRaw`
- `ProjectQueryRowByProfile<P>`

This keeps DB services honest about the relation graph they actually load.

## DB Service Pattern

When a DB service returns different relation graphs by profile:

1. accept `profile` instead of a loose `withRelations` bag
2. overload the service by profile where useful
3. return profile-mapped row types

This is better than casting a broad row union to an old legacy alias.

## Migration Steps

For each resource:

1. Add or complete current Zod schema exports in `<resource>.ts`.
2. Create `<resource>.types.ts` next to it.
3. Move resource-owned types from [`src/lib/types.ts`](/home/io/code/hype/src/lib/types.ts) into the local file.
4. Update all imports to point to the local file directly.
5. Replace deprecated raw aliases with current profile-aware row types.
6. Verify the DB service, API service, remote entrypoints, and main admin page together.

## What Stays In `types.ts`

Keep these in [`src/lib/types.ts`](/home/io/code/hype/src/lib/types.ts):

- shared API envelope types
- app context/controller types
- shared auth types
- shared capability-definition types used by multiple resources
- generic utility types reused across resources

## What Should Move Out

Move these into resource-local `*.types.ts` files:

- `<Resource>DB`, `<Resource>DBNew`, `<Resource>DBPartial`
- `<Resource>Profile` and profile-mapped response/query types
- `<Resource>FormInput`
- `<Resource>Role*`, `<Resource>I18n*`
- resource-specific raw/query helper types

## Rule Of Thumb

If a type cannot be understood without reading one resource's schema, it belongs next to that resource, not in the global types file.
