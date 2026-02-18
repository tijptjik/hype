// TYPES
import type {
  AuthorizeParams,
  AuthorizationDecision,
  OrganisationAuthorizationAction,
  OrganisationAuthorizationField,
  UserRoleDisco,
} from '$lib/types'

type OrganisationPolicyHandler = (params: AuthorizeParams) => AuthorizationDecision

const CORE_HUB_CODE = 'core'

const ORGANISATION_CORE_ADMIN_ONLY_FIELDS = new Set<OrganisationAuthorizationField>([
  'hubId',
  'isCoreInclusive',
])

const ORGANISATION_HUB_ADMIN_ONLY_FIELDS = new Set<OrganisationAuthorizationField>([
  'isHubExclusive',
])

const isHubAdminRole = (role: UserRoleDisco): boolean =>
  role.type === 'hub' && role.role === 'admin'

const isCoreHubAdmin = (roles: UserRoleDisco[]): boolean =>
  roles.some(
    role =>
      isHubAdminRole(role) &&
      (role as { hub?: { code?: string | null } }).hub?.code === CORE_HUB_CODE,
  )

const getScopedHubAdminIds = (roles: UserRoleDisco[]): Set<string> =>
  new Set(
    roles
      .filter(role => isHubAdminRole(role))
      .filter(
        role =>
          (role as { hub?: { code?: string | null } }).hub?.code !== CORE_HUB_CODE,
      )
      .map(role => (role as { hubId: string }).hubId),
  )

const isOrganisationOwner = (
  roles: UserRoleDisco[],
  organisationId?: string,
): boolean =>
  Boolean(organisationId) &&
  roles.some(
    role =>
      role.type === 'organisation' &&
      role.organisationId === organisationId &&
      role.role === 'owner',
  )

const isRelevantHubAdmin = (
  roles: UserRoleDisco[],
  organisationHubId?: string | null,
): boolean => {
  if (isCoreHubAdmin(roles)) return true
  if (!organisationHubId) return false
  return getScopedHubAdminIds(roles).has(organisationHubId)
}

const evaluateOrganisationReadStatePolicy = (
  params: AuthorizeParams,
): AuthorizationDecision => {
  if (
    params.requestedState?.isArchived === undefined ||
    params.requestedState?.isPublished === undefined
  ) {
    return { allowed: false, code: 'REQUEST_STATE_REQUIRED' }
  }

  const isArchived = params.requestedState.isArchived
  const isPublished = params.requestedState.isPublished
  const isStrong = isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  const isOwner = isOrganisationOwner(params.userRoles, params.resourceId)

  if (isArchived) {
    return isStrong ? { allowed: true } : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (!isPublished) {
    return isOwner || isStrong
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  return { allowed: true }
}

const createOrganisationPolicy: OrganisationPolicyHandler = params => {
  if (params.isAuthenticated === false || !params.userId) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  if (isCoreHubAdmin(params.userRoles)) return { allowed: true }

  if (!params.resourceHubId) {
    return { allowed: false, code: 'HUB_SCOPE_FORBIDDEN' }
  }

  return getScopedHubAdminIds(params.userRoles).has(params.resourceHubId)
    ? { allowed: true }
    : { allowed: false, code: 'HUB_SCOPE_FORBIDDEN' }
}

const readOrganisationPolicy: OrganisationPolicyHandler = params => {
  if (params.isAuthenticated === false || !params.userId) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  return evaluateOrganisationReadStatePolicy(params)
}

const listOrganisationsPolicy: OrganisationPolicyHandler = params => {
  if (params.isAuthenticated === false || !params.userId) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  return evaluateOrganisationReadStatePolicy(params)
}

const updateOrganisationPolicy: OrganisationPolicyHandler = params => {
  if (params.isAuthenticated === false || !params.userId) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  const owner = isOrganisationOwner(params.userRoles, params.resourceId)
  const hubAdmin = isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  if (!owner && !hubAdmin) {
    return { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  const fields = params.fields ?? []
  const actorIsCoreAdmin = isCoreHubAdmin(params.userRoles)
  for (const field of fields) {
    if (ORGANISATION_CORE_ADMIN_ONLY_FIELDS.has(field) && !actorIsCoreAdmin) {
      return { allowed: false, code: 'FIELD_FORBIDDEN' }
    }
    if (ORGANISATION_HUB_ADMIN_ONLY_FIELDS.has(field) && !hubAdmin) {
      return { allowed: false, code: 'FIELD_FORBIDDEN' }
    }
  }

  return { allowed: true }
}

const publishOrganisationPolicy: OrganisationPolicyHandler = params =>
  updateOrganisationPolicy(params)

const manageOrganisationRolesPolicy: OrganisationPolicyHandler = params => {
  if (params.isAuthenticated === false || !params.userId) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  const owner = isOrganisationOwner(params.userRoles, params.resourceId)
  const hubAdmin = isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  if (!owner && !hubAdmin) {
    return { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  return { allowed: true }
}

const deleteOrganisationPolicy: OrganisationPolicyHandler = params =>
  createOrganisationPolicy(params)

export const organisationPolicyMap: Record<
  OrganisationAuthorizationAction,
  OrganisationPolicyHandler
> = {
  readOrganisation: readOrganisationPolicy,
  listOrganisations: listOrganisationsPolicy,
  createOrganisation: createOrganisationPolicy,
  updateOrganisation: updateOrganisationPolicy,
  publishOrganisation: publishOrganisationPolicy,
  manageOrganisationRoles: manageOrganisationRolesPolicy,
  deleteOrganisation: deleteOrganisationPolicy,
}
