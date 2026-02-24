// TYPES
import type {
  AuthorizeParams,
  AuthorizationDecision,
  HubAuthorizationAction,
  HubAuthorizeParams,
  OrganisationAuthorizeParams,
  OrganisationAuthorizationAction,
  ProjectAuthorizationAction,
  ProjectAuthorizeParams,
  UserRoleDisco,
} from '$lib/types'
// I18N
import { m } from '$lib/i18n'
// ENUMS
import { FirstClassResource, RESERVED_PARAMETERS, ResourcePath } from '$lib/enums'
// POLICIES
import { organisationPolicyMap } from './organisation'
import { projectPolicyMap } from './project'
import { hubPolicyMap } from './hub'
export type AuthzActorBase = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
}

export const toActorPolicyBase = (actor: AuthzActorBase): AuthzActorBase => ({
  userId: actor.userId,
  userRoles: actor.userRoles,
  isAuthenticated: actor.isAuthenticated,
  isAnonymous: actor.isAnonymous,
  isSuperAdmin: actor.isSuperAdmin,
})

export const toUserRoleSignature = (
  userRoles: Array<{ userId: string; role: string }>,
): string =>
  userRoles
    .map(role => `${role.userId}:${role.role}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|')

export const shouldLogAuthzDeny = (): boolean => {
  const fromProcess =
    typeof process !== 'undefined' ? process.env?.AUTHZ_LOG_DENY : undefined
  const fromImportMeta = (import.meta as { env?: Record<string, string | undefined> })
    .env?.AUTHZ_LOG_DENY
  const value = (fromProcess ?? fromImportMeta)?.toLowerCase()
  return value === '1' || value === 'true'
}

export const toOrganisationUserRoleSignature = toUserRoleSignature
export const toProjectUserRoleSignature = toUserRoleSignature

export {
  toOrganisationSubmittedFields,
  toOrganisationAuthActor,
  authorizeOrganisationCreateForSubmission,
  authorizeOrganisationUpdateForSubmission,
  authorizeOrganisationReadForProbe,
  authorizeOrganisationListForContext,
  authorizeOrganisationRead,
  authorizeOrganisationList,
  authorizeOrganisationCreate,
  authorizeOrganisationUpdate,
  authorizeOrganisationManageRolesForSubmission,
  authorizeOrganisationPublishForSubmission,
  authorizeOrganisationDeleteForSubmission,
  ensureOrganisationCommandAllowed,
  authorizeOrganisationManageRoles,
  authorizeOrganisationPublish,
  authorizeOrganisationDelete,
  resolveOrganisationActionPermissions,
} from './organisation'
export {
  toHubSubmittedFields,
  toHubUserRoleSignature,
  toHubAuthActor,
  authorizeHubCreateForSubmission,
  authorizeHubUpdateForSubmission,
  isCoreHubAdmin,
  getScopedHubAdminIds,
  toHubListConditions,
  authorizeHubReadForProbe,
  authorizeHubRead,
  authorizeHubList,
  authorizeHubCreate,
  authorizeHubUpdate,
  authorizeHubManageRolesForSubmission,
  authorizeHubPublishForSubmission,
  authorizeHubDeleteForSubmission,
  ensureHubCommandAllowed,
  hasInvalidHubOrganisationAssignmentsForSubmission,
  authorizeHubManageRoles,
  authorizeHubPublish,
  authorizeHubDelete,
  resolveHubActionPermissions,
  hubPolicyMap,
} from './hub'
export {
  toProjectAuthActor,
  toProjectSubmittedFields,
  toProjectUserRoleCapabilitiesSignature,
  authorizeProjectList,
  authorizeProjectListForContext,
  authorizeProjectRead,
  authorizeProjectReadForProbe,
  authorizeProjectCreate,
  authorizeProjectCreateForSubmission,
  authorizeProjectUpdate,
  authorizeProjectUpdateForSubmission,
  authorizeProjectManageRoles,
  authorizeProjectManageRolesForSubmission,
  authorizeProjectManageCapabilities,
  authorizeProjectManageCapabilitiesForSubmission,
  authorizeProjectAssignCapabilities,
  authorizeProjectAssignCapabilitiesForSubmission,
  authorizeProjectPublish,
  authorizeProjectPublishForSubmission,
  authorizeProjectDelete,
  authorizeProjectDeleteForSubmission,
  canCreateAnyProject,
  canSetProjectParentOrganisation,
  resolveProjectParentOrganisationScope,
  ensureProjectCommandAllowed,
  projectPolicyMap,
} from './project'
export { authorizeImageList, authorizeImageRead } from './image'
export { canSearchUsers, canOverrideUserSearchArchivedFilter } from './user'

const RESOURCE_CODE_SEGMENTS = [
  ...Object.values(FirstClassResource),
  ...Object.values(ResourcePath),
].map(value => value.toLowerCase())

const PLATFORM_RESERVED_CODES = [
  'api',
  'app',
  'admin',
  'core',
  'root',
  'system',
  'www',
  'assets',
  'static',
  'docs',
  'help',
  'support',
  'login',
  'logout',
  'signin',
  'signup',
  'settings',
  'profile',
]

const IDENTITY_RESERVED_CODES = [
  'hype',
  'hypehk',
  'hkhype',
  'tijptjik',
  'mart',
  'hongkong',
  'hk',
  'hkgov',
  'govhk',
]

export const RESERVED_CODES = new Set(
  [
    ...RESERVED_PARAMETERS,
    ...RESOURCE_CODE_SEGMENTS,
    ...PLATFORM_RESERVED_CODES,
    ...IDENTITY_RESERVED_CODES,
  ].map(value => value.toLowerCase()),
)

export const isReservedCode = (value: string): boolean =>
  RESERVED_CODES.has(value.trim().toLowerCase())

export const toIssueDetailMessage = (code: string): string => {
  if (code === 'UNAUTHENTICATED') return m.admin__authz_unauthenticated()
  if (code === 'HUB_SCOPE_FORBIDDEN') return m.admin__authz_hub_scope_forbidden()
  if (code === 'REQUEST_STATE_REQUIRED') return m.admin__authz_request_state_required()
  if (code === 'INSUFFICIENT_ROLE') return m.admin__authz_insufficient_role()
  if (code === 'FIELD_FORBIDDEN') return m.admin__authz_field_forbidden()
  if (code === 'STALE_WRITE') return m.admin__authz_stale_write()
  if (code === 'CODE_RESERVED') return m.admin__validation_code_is_reserved()
  if (code === 'CODE_ALREADY_EXISTS') return m.admin__validation_code_already_exists()
  if (code === 'USER_ROLES_REQUIRED') return m.admin__validation_user_roles_add_user()
  if (code === 'OWNER_REQUIRED')
    return m.admin__validation_user_roles_at_least_one_owner()
  return m.forms__invalid()
}

export const toFormIssueMessage = (code: string): string => {
  return `${code}: ${toIssueDetailMessage(code)}`
}

export const toAuthMessage = (code: string): string => {
  if (
    code === 'UNAUTHENTICATED' ||
    code === 'HUB_SCOPE_FORBIDDEN' ||
    code === 'REQUEST_STATE_REQUIRED' ||
    code === 'INSUFFICIENT_ROLE' ||
    code === 'FIELD_FORBIDDEN' ||
    code === 'STALE_WRITE'
  ) {
    return toFormIssueMessage(code)
  }
  return `${code}: ${m.missing_permissions()}`
}

const policyMap = {
  hub: hubPolicyMap,
  organisation: organisationPolicyMap,
  project: projectPolicyMap,
} as const

/**
 * Central authorization entry point.
 * Resource types without policy maps intentionally return NOT_IMPLEMENTED.
 */
function authorize(params: AuthorizeParams): AuthorizationDecision {
  if (params.resourceType === 'organisation') {
    const handler =
      policyMap.organisation[params.action as OrganisationAuthorizationAction]
    if (!handler) {
      throw new Error(
        `NOT_IMPLEMENTED: authorize(${params.resourceType}/${params.action})`,
      )
    }
    return handler(params as OrganisationAuthorizeParams)
  }

  if (params.resourceType === 'project') {
    const handler = policyMap.project[params.action as ProjectAuthorizationAction]
    if (!handler) {
      throw new Error(
        `NOT_IMPLEMENTED: authorize(${params.resourceType}/${params.action})`,
      )
    }
    return handler(params as ProjectAuthorizeParams)
  }

  if (params.resourceType === 'hub') {
    const handler = policyMap.hub[params.action as HubAuthorizationAction]
    if (!handler) {
      throw new Error(
        `NOT_IMPLEMENTED: authorize(${params.resourceType}/${params.action})`,
      )
    }
    return handler(params as HubAuthorizeParams)
  }

  throw new Error(`NOT_IMPLEMENTED: authorize(${params.resourceType})`)
}

export default authorize
