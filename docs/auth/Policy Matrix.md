# Policy Matrix

This document records the current authorization behavior implemented in code.

Table provenance:
- `Pure test output`: the table is fully backed by explicit matrix-style tests and can be printed from the test suite.
- `User-defined summary`: the table is maintained in this document as a source-derived summary. Some or all rows may still be covered by tests, but the table itself is not generated verbatim from test output.
- Bold text highlights a mismatch between the documented/specifed behavior and the currently tested behavior.

Sources:
- `src/lib/api/services/authz/organisation.ts`
- `src/lib/api/services/authz/project.ts`
- `src/lib/api/services/authz/hub.ts`
- `src/lib/api/server/organisation.remote.ts`
- `src/lib/api/server/project.remote.ts`
- `src/lib/api/server/hub.remote.ts`
- `src/tests/authorization.organisation.test.ts`
- `src/tests/authorization.project.test.ts`
- `src/tests/authorization.hub.test.ts`
- `src/tests/organisation.remote.test.ts`
- `src/tests/project.remote.test.ts`
- `src/tests/hub.remote.test.ts`


## Hub

### Action-Level Matrix
Provenance: `Pure test output`

| Action | Core hub admin | Scoped non-core hub admin (same hub) | Non-core hub admin (other hub) | Organisation owner | Unrelated authenticated user | Anonymous |
| --- | --- | --- | --- | --- | --- | --- |
| `listHubs` | Allow | Allow | Deny | Deny | Deny | Deny |
| `readHub` | Allow | Allow | Deny | Deny | Deny | Deny |
| `createHub` | Allow | Deny | Deny | Deny | Deny | Deny |
| `updateHub` | Allow | Allow | Deny | Deny | Deny | Deny |
| `manageHubRoles` | Allow | Allow | Deny | Deny | Deny | Deny |
| `publishHub` | Allow | Allow | Deny | Deny | Deny | Deny |
| `deleteHub` | Allow | Deny | Deny | Deny | Deny | Deny |

### Field-Level Matrix (`updateHub`)
Provenance: `Pure test output`

| Field group | Core hub admin | Scoped non-core hub admin (same hub) |
| --- | --- | --- |
| All hub form fields (`code`, `domain`, `i18n`, `userRoles`, `organisations`, `isPublished`, `isArchived`) | Allow | Allow |

Note: hub policy currently has no hub-field subgroup restrictions; field gating is action-based.

### Validation/Integrity Matrix
Provenance: `User-defined summary`

| Flow | Rule | Expected result |
| --- | --- | --- |
| Create/Update | `userRoles` empty | Deny (`invalid`: `USER_ROLES_REQUIRED`) |
| Create/Update | Duplicate `userRoles.userId` | Deny (`invalid`) |
| Create/Update | `code` is reserved | Deny (`invalid`: `CODE_RESERVED`) |
| Create/Update | `code` conflict | Deny (`invalid`: `CODE_ALREADY_EXISTS`) |
| Update | Submitted organisation assignment outside actor scope | Deny (`invalid`: `HUB_SCOPE_FORBIDDEN`) |
| Update | Missing `meta.updatedAt` | Deny (`invalid`: `STALE_WRITE`) |
| Update | `meta.updatedAt` differs from persisted `modifiedAt` | Deny (`invalid`: `STALE_WRITE`) |
| Role mutation | Actor lacks `manageHubRoles` | Deny (`invalid` with authz code) |
| Unauthorized command | Actor lacks action permission | Deny (`403` + authz code) |

## Organisation

### Action-Level Matrix
Provenance: `Pure test output`

| Action | Core hub admin | Scoped non-core hub admin (same hub) | Non-core hub admin (other hub) | Organisation owner | Organisation member | Unrelated authenticated user | Anonymous |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `listOrganisations` (published) | Allow | Allow | Allow | Allow | Allow | Allow | Deny |
| `listOrganisations` (unpublished) | Allow | Allow | Deny | Allow | Allow | Deny | Deny |
| `listOrganisations` (archived) | Allow | Allow | Deny | Allow | Deny | Deny | Deny |
| `readOrganisation` (published) | Allow | Allow | Allow | Allow | Allow | Allow | Deny |
| `readOrganisation` (unpublished) | Allow | Allow | Deny | Allow | Allow | Deny | Deny |
| `readOrganisation` (archived) | Allow | Allow | Deny | Allow | Deny | Deny | Deny |
| `createOrganisation` | Allow | Allow | Deny | Deny | Deny | Deny | Deny |
| `updateOrganisation` (non-restricted fields) | Allow | Allow | Deny | Allow | Deny | Deny | Deny |
| `manageOrganisationRoles` | Allow | Allow | Deny | Allow | Deny | Deny | Deny |
| `publishOrganisation` | Allow | Allow | Deny | Allow | Deny | Deny | Deny |
| `deleteOrganisation` | Allow | Allow | Deny | Allow | Deny | Deny | Deny |

### Field-Level Matrix (`updateOrganisation`)
Provenance: `Pure test output`

| Field group | Core hub admin | Scoped non-core hub admin (same hub) | Organisation owner |
| --- | --- | --- | --- |
| `hubId`, `isCoreInclusive` | Allow | Deny | Deny |
| `isHubExclusive` | Allow | Allow | Deny |
| Other organisation fields | Allow | Allow | Allow |

### Validation/Integrity Matrix
Provenance: `User-defined summary`

| Flow | Rule | Expected result |
| --- | --- | --- |
| Create/Update | `userRoles` empty | Deny (`invalid`: `USER_ROLES_REQUIRED`) |
| Create/Update | No owner in `userRoles` | Deny (`invalid`: `OWNER_REQUIRED`) |
| Create/Update | Duplicate `userRoles.userId` | Deny (`invalid`) |
| Create/Update | `code` is reserved | Deny (`invalid`: `CODE_RESERVED`) |
| Create/Update | `code` conflict | Deny (`invalid`: `CODE_ALREADY_EXISTS`) |
| Update | Missing `meta.updatedAt` | Deny (`invalid`: `STALE_WRITE`) |
| Update | `meta.updatedAt` differs from persisted `modifiedAt` | Deny (`invalid`: `STALE_WRITE`) |
| Role mutation | Actor lacks `manageOrganisationRoles` | Deny (`invalid` with authz code) |
| Unauthorized command | Actor lacks action permission | Deny (`403` + authz code) |

## Project

### Action-Level Matrix
Provenance: `Pure test output`

| Action | Core hub admin | Scoped non-core hub admin (same hub) | Non-core hub admin (other hub) | Organisation owner | Organisation member | Project owner | Project maintainer | Project translator | Project member | Project user | Unrelated authenticated user | Anonymous |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `listProjects` (published) | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Deny |
| `listProjects` (unpublished) | Allow | Allow | Deny | Allow | Allow | Allow | Allow | Allow | Allow | Deny | Deny | Deny |
| `listProjects` (archived) | Allow | Allow | Deny | Allow | Deny | Allow | Deny | Deny | Deny | Deny | Deny | Deny |
| `readProject` (published) | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Deny |
| `readProject` (unpublished) | Allow | Allow | Deny | Allow | Allow | Allow | Allow | Allow | Allow | Deny | Deny | Deny |
| `readProject` (archived) | Allow | Allow | Deny | Allow | Deny | Allow | Deny | Deny | Deny | Deny | Deny | Deny |
| `createProject` | Allow | Allow | Deny | Allow | Deny | Deny | Deny | Deny | Deny | Deny | Deny | Deny |
| `updateProject` (non-i18n) | Allow | Allow | Deny | Allow | Deny | Allow | Allow | Deny | Deny | Deny | Deny | Deny |
| `updateProject` (i18n) | Allow | Allow | Deny | Allow | Deny | Allow | Allow | Allow | Deny | Deny | Deny | Deny |
| `manageProjectRoles` | Allow | Allow | Deny | Allow | Deny | Allow | Allow | Deny | Deny | Deny | Deny | Deny |
| `manageCapabilities` | Allow | Allow | Deny | Allow | Deny | Allow | Deny | Deny | Deny | Deny | Deny | Deny |
| `assignCapabilities` | Allow | Allow | Deny | Allow | Deny | Allow | Allow | Deny | Deny | Deny | Deny | Deny |
| `publishProject` | Allow | Allow | Deny | Allow | Deny | Allow | Allow | Deny | Deny | Deny | Deny | Deny |
| `deleteProject` (archive/restore) | Allow | Allow | Deny | Allow | Deny | Allow | Deny | Deny | Deny | Deny | Deny | Deny |

### Field-Level Matrix (`updateProject`)
Provenance: `Pure test output`

| Field group | Core hub admin | Scoped non-core hub admin (same hub) | Organisation owner | Project owner | Project maintainer | Project translator |
| --- | --- | --- | --- | --- | --- | --- |
| `organisationId` | Allow | Deny | Deny | Deny | Deny | Deny |
| `i18n` | Allow | Allow | Allow | Allow | Allow | Allow |
| Other project fields (`code`, `properties`, etc.) | Allow | Allow | Allow | Allow | Allow | Deny |

### Validation/Integrity Matrix
Provenance: `User-defined summary`

| Flow | Rule | Expected result |
| --- | --- | --- |
| Create/Update | `userRoles` empty | Deny (`invalid`: `USER_ROLES_REQUIRED`) |
| Create/Update | Duplicate `userRoles.userId` | Deny (`invalid`) |
| Create/Update | Duplicate property keys | Deny (`invalid`) |
| Create/Update | `code` is reserved | Deny (`invalid`: `CODE_RESERVED`) |
| Create/Update | `code` conflict | Deny (`invalid`: `CODE_ALREADY_EXISTS`) |
| Update | Submitted `projectId` differs from persisted one | Deny (`invalid`: `FIELD_FORBIDDEN`) |
| Update | Missing `meta.updatedAt` | Deny (`invalid`: `STALE_WRITE`) |
| Update | `meta.updatedAt` differs from persisted `modifiedAt` | Deny (`invalid`: `STALE_WRITE`) |
| Role membership mutation | Actor lacks `manageProjectRoles` | Deny (`invalid` with authz code) |
| Role capability assignment mutation | Actor lacks `assignCapabilities` | Deny (`invalid` with authz code) |
| Project capability config mutation | Actor lacks `manageCapabilities` | Deny (`invalid` with authz code) |
| Unauthorized command | Actor lacks action permission | Deny (`403` + authz code) |
