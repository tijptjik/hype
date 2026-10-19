/** Runtime policy vocabulary; type contracts are in authorization.types.ts. */

/* ----------------- */
// AUTHORIZATION
/* -------- */

export const authorizationResourceTypes = [
  'organisation',
  'project',
  'layer',
  'feature',
  'task',
  'hub',
  'property',
  'user',
] as const

export const organisationAuthorizationActions = [
  'readOrganisation',
  'listOrganisations',
  'createOrganisation',
  'updateOrganisation',
  'publishOrganisation',
  'manageOrganisationRoles',
  'deleteOrganisation',
] as const

export const projectAuthorizationActions = [
  'listProjects',
  'readProject',
  'createProject',
  'updateProject',
  'manageProjectRoles',
  'manageCapabilities',
  'assignCapabilities',
  'publishProject',
  'deleteProject',
] as const

export const hubAuthorizationActions = [
  'listHubs',
  'readHub',
  'createHub',
  'updateHub',
  'manageHubRoles',
  'publishHub',
  'deleteHub',
] as const

export const organisationAuthorizationFields = [
  'code',
  'url',
  'i18n',
  'userRoles',
  'properties',
  'hubId',
  'isCoreInclusive',
  'isHubExclusive',
  'isPublished',
] as const

export const projectAuthorizationFields = [
  'placeUpdatePolicy',
  'useAllInOrgContext',
  'cardStyleCode',
  'organisationId',
  'code',
  'i18n',
  'license',
  'capabilities',
  'userRoles',
  'projectRoleCapabilities',
  'properties',
  'isPublished',
  'isArchived',
] as const

export const hubAuthorizationFields = [
  'code',
  'domain',
  'i18n',
  'userRoles',
  'organisations',
  'isPublished',
  'isArchived',
] as const

export const authorizationDenyCodes = [
  'UNAUTHENTICATED',
  'ACCOUNT_REQUIRED',
  'REQUEST_STATE_REQUIRED',
  'INSUFFICIENT_ROLE',
  'HUB_SCOPE_FORBIDDEN',
  'FIELD_FORBIDDEN',
  'NOT_IMPLEMENTED',
] as const
