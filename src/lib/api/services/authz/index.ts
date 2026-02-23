// TYPES
import type {
  AuthorizeParams,
  AuthorizationDecision,
  OrganisationAuthorizationAction,
} from '$lib/types'
// I18N
import { m } from '$lib/i18n'
// ENUMS
import { FirstClassResource, RESERVED_PARAMETERS, ResourcePath } from '$lib/enums'
// POLICIES
import { organisationPolicyMap } from './organisation'
export {
  toOrganisationSubmittedFields,
  toOrganisationUserRoleSignature,
  toOrganisationAuthActor,
  authorizeOrganisationReadForProbe,
  authorizeOrganisationListForContext,
  authorizeOrganisationRead,
  authorizeOrganisationList,
  authorizeOrganisationCreate,
  authorizeOrganisationUpdate,
  authorizeOrganisationManageRoles,
  authorizeOrganisationPublish,
  authorizeOrganisationDelete,
  resolveOrganisationActionPermissions,
} from './organisation'
export {
  toHubSubmittedFields,
  toHubUserRoleSignature,
  toHubAuthActor,
  isCoreHubAdmin,
  getScopedHubAdminIds,
  toHubListConditions,
  authorizeHubReadForProbe,
  authorizeHubRead,
  authorizeHubList,
  authorizeHubCreate,
  authorizeHubUpdate,
  authorizeHubManageRoles,
  authorizeHubPublish,
  authorizeHubDelete,
  resolveHubActionPermissions,
} from './hub'
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
  organisation: organisationPolicyMap,
} as const

/**
 * Central authorization entry point.
 * Resource types other than `organisation` intentionally return NOT_IMPLEMENTED in v1.
 */
function authorize(params: AuthorizeParams): AuthorizationDecision {
  if (params.resourceType !== 'organisation') {
    throw new Error(`NOT_IMPLEMENTED: authorize(${params.resourceType})`)
  }

  const resourcePolicyMap = policyMap[params.resourceType]
  const handler = resourcePolicyMap[params.action as OrganisationAuthorizationAction]
  if (!handler) {
    throw new Error(
      `NOT_IMPLEMENTED: authorize(${params.resourceType}/${params.action})`,
    )
  }

  return handler(params)
}

export default authorize
