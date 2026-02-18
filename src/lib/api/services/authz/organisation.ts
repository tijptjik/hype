// TYPES
import type {
  AuthorizeParams,
  AuthorizationDecision,
  OrganisationAuthorizationAction,
  OrganisationAuthorizationField,
  UserRoleDisco,
} from '$lib/types'

type OrganisationPolicyHandler = (params: AuthorizeParams) => AuthorizationDecision

/* ----------------- */
// AUTH INPUT TYPES
/* -------- */

type OrganisationAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
}
type OrganisationAuthTarget = {
  resourceId?: string
  resourceHubId?: string | null
}

/* ----------------- */
// POLICY CONSTANTS
/* -------- */

const CORE_HUB_CODE = 'core'

const ORGANISATION_CORE_ADMIN_ONLY_FIELDS = new Set<OrganisationAuthorizationField>([
  'hubId',
  'isCoreInclusive',
])

const ORGANISATION_HUB_ADMIN_ONLY_FIELDS = new Set<OrganisationAuthorizationField>([
  'isHubExclusive',
])

/* ----------------- */
// ROLE RESOLUTION
/* -------- */

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

/* ----------------- */
// READ/LIST POLICY EVALUATION
/* -------- */

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

/* ----------------- */
// ACTION POLICIES
/* -------- */

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

/* ----------------- */
// AUTH HELPERS (SERVER CALL SITES)
/* -------- */

export const toOrganisationSubmittedFields = (
  data: Partial<Record<OrganisationAuthorizationField, unknown>>,
): OrganisationAuthorizationField[] => {
  const fields: OrganisationAuthorizationField[] = []
  if ('code' in data) fields.push('code')
  if ('url' in data) fields.push('url')
  if ('i18n' in data) fields.push('i18n')
  if ('userRoles' in data) fields.push('userRoles')
  return fields
}

export const toOrganisationUserRoleSignature = (
  userRoles: Array<{ userId: string; role: string }>,
): string =>
  userRoles
    .map(role => `${role.userId}:${role.role}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|')

export const authorizeOrganisationRead = (
  actor: OrganisationAuthActor,
  target: OrganisationAuthTarget,
  requestedState: { isPublished: boolean; isArchived: boolean },
): AuthorizationDecision =>
  readOrganisationPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    resourceType: 'organisation',
    action: 'readOrganisation',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
    requestedState,
  })

export const authorizeOrganisationCreate = (
  actor: OrganisationAuthActor,
  target: Pick<OrganisationAuthTarget, 'resourceHubId'>,
  fields: OrganisationAuthorizationField[],
): AuthorizationDecision =>
  createOrganisationPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    resourceType: 'organisation',
    action: 'createOrganisation',
    resourceHubId: target.resourceHubId,
    fields,
  })

export const authorizeOrganisationUpdate = (
  actor: OrganisationAuthActor,
  target: Required<OrganisationAuthTarget>,
  fields: OrganisationAuthorizationField[],
): AuthorizationDecision =>
  updateOrganisationPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    resourceType: 'organisation',
    action: 'updateOrganisation',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
    fields,
  })

export const authorizeOrganisationManageRoles = (
  actor: OrganisationAuthActor,
  target: Required<OrganisationAuthTarget>,
): AuthorizationDecision =>
  manageOrganisationRolesPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    resourceType: 'organisation',
    action: 'manageOrganisationRoles',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
    fields: ['userRoles'],
  })

/* ----------------- */
// POLICY MAP
/* -------- */

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
