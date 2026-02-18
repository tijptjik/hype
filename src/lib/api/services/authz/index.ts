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
  authorizeOrganisationRead,
  authorizeOrganisationList,
  authorizeOrganisationCreate,
  authorizeOrganisationUpdate,
  authorizeOrganisationManageRoles,
  authorizeOrganisationPublish,
  authorizeOrganisationDelete,
} from './organisation'

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

export const toAuthMessage = (code: string): string =>
  `${code}: ${m.missing_permissions()}`

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
