# Authorization Design Notes

## Purpose
Working notes for designing a unified authorization system with hierarchical ownership, field-level permissions, and remote-function query APIs.

## Current Hierarchy
- Resource chain: `organisation -> project -> layer -> feature -> task`
- Parent refs in schema:
  - `project.organisationId`
  - `layer.organisationId`, `layer.projectId`
  - `feature.organisationId`, `feature.projectId`, `feature.layerId`
  - `task.organisationId`, `task.projectId`, `task.featureId`

## Current Role Model
- Hub roles: `hubRole` (`HubRoleType.admin`)
- Organisation roles: `organisationRole` (`owner`, `member`)
- Project roles: `projectRole` (`owner`, `maintainer`, `member`, `translator`, `user`)
- Existing checks are spread across:
  - `src/lib/client/services/auth.ts`
  - `src/lib/auth/asserts.ts`
  - resource-specific query context functions in `src/lib/api/services/*`

## Status Flags and Access
- First-class resources include `isPublished` and `isArchived`.
- Requirement: policy must control who can request:
  - unpublished content (`isPublished === false`)
  - published content (`isPublished === true`, `isArchived === false`)
  - archived content (`isArchived === true`)
- Default read behavior should remain explicit in list APIs via default conditions.

## Proposed Authorization Model
- Single function:
  - `authorize({ userId, resourceType, resourceId, action, fields? })`
- Decision inputs:
  - role assignments (`hubRole`, `organisationRole`, `projectRole`)
  - resolved resource ancestry
  - optional field list for write checks
- Deterministic precedence:
  - explicit deny > allow
  - narrower scope > broader scope
  - direct subject > inherited role

## Confirmed Decisions
- Default list filters: `isPublished: true`, `isArchived: false`.
- Prism identifiers: use IDs.
- `hubRole` inheritance: yes, inherit across organisation/project descendants.
