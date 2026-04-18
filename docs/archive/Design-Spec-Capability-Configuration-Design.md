# Capability Configuration Design

## Goal
Add schema support for configurable project capabilities so admins can:
- define assignable capability keys and localized labels at the organisation level,
- override that definition at the project level,
- assign capability flags per user in `projectRole.capabilities`.

This document defines the backend/data model now. UI components and facets can be implemented later.

## Scope
- In scope: database schema, migration, form payload support, persistence wiring.
- Out of scope: new admin UI components, capability management grids, i18n message catalog wiring for labels.

## Canonical Capability Keys
Capability keys are app-internal identifiers:
- `manageBakeries`
- `manageVolunteers`
- `manageDropOffs`

These keys are stable and used in:
- organisation/project capability definitions (what can be assigned),
- project role capability flags (what is assigned to a user role).

## Data Model

### 1) Organisation Capability Definitions
Stored in `organisation.capabilities` (JSON text, default `{}`):

```json
{
  "manageBakeries": {
    "i18n": {
      "en": "Bakery Manager",
      "zhHans": "面包店管理",
      "zhHant": "麵包店管理"
    }
  }
}
```

Meaning: organisation-wide default capability catalog for all projects in the organisation.

### 2) Project Capability Definitions (Override)
Stored in `project.capabilities` (JSON text, default `{}`):

```json
{
  "manageVolunteers": {
    "i18n": {
      "en": "Volunteer Coordinator"
    }
  }
}
```

Meaning: project-level override catalog.

Resolution rule:
- if `project.capabilities` is non-empty, use project catalog;
- otherwise, fall back to `organisation.capabilities`.

### 3) Project Role Capability Assignments
Stored in `projectRole.capabilities` (existing JSON text field):

```json
{
  "manageBakeries": true,
  "manageVolunteers": false,
  "manageDropOffs": true
}
```

Meaning: per-user assignment flags for a specific project role row.

Removal rule:
- removing a user from `projectRole` also removes their capability assignments because assignments live on the same row.

## Admin Facet Plan (Future UI)
- Organisation admin page: add a `capabilities` facet to edit organisation default capability definitions.
- Project admin page: add a `capabilities` facet to:
  - edit project override capability definitions,
  - assign capability flags to each user listed in project user roles.

## Implemented Backend Changes
- Added `organisation.capabilities` JSON column (`NOT NULL`, default `{}`).
- Added `project.capabilities` JSON column (`NOT NULL`, default `{}`).
- Added shared capability types in `src/lib/types.ts`.
- Extended Zod schemas/form schemas for organisation and project to accept and validate capability definitions.
- Wired project/organisation remote form create/update flows to persist capability definition payloads.
- Existing `projectRole.capabilities` remains the assignment storage model.

## Migration
- SQL migration: `migrations/0012_capabilities_scope_overrides.sql`
- Snapshot: `migrations/meta/0012_snapshot.json`

## Notes
- This model supports organization-specific terminology via labels without changing internal auth keys.
- This change does not yet enforce capability-aware authorization logic; it establishes persistence and shape for the upcoming UI and policy layer work.
