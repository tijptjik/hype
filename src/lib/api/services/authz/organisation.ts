import { error } from '@sveltejs/kit'
import { toAuthMessage } from '.'
import { getScopedHubAdminIds, isCoreHubAdmin } from './hub'
import { hasAuthenticatedSession } from './user'
// TYPES
import type {
  AuthorizeParams,
  AuthorizationDecision,
  OrganisationActionPermissions,
  OrganisationAuthorizationAction,
  OrganisationAuthorizationField,
  UserRoleDisco,
} from '$lib/types'

type OrganisationPolicyHandler = (params: AuthorizeParams) => AuthorizationDecision

/* ----------------- */
// AUTH INPUT TYPES
/* -------- */

export type OrganisationAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
}
type OrganisationAuthTarget = {
  resourceId?: string
  resourceHubId?: string | null
}

/* ----------------- */
// POLICY CONSTANTS
/* -------- */

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

export const isOrganisationOwner = (
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

const hasOrganisationRole = (
  roles: UserRoleDisco[],
  organisationId?: string,
): boolean =>
  Boolean(organisationId) &&
  roles.some(
    role => role.type === 'organisation' && role.organisationId === organisationId,
  )

export const hasAnyOrganisationRole = (roles: UserRoleDisco[]): boolean =>
  roles.some(role => role.type === 'organisation')

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
  const isMemberOrOwner = hasOrganisationRole(params.userRoles, params.resourceId)

  if (isArchived) {
    return isStrong ? { allowed: true } : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (!isPublished) {
    return isMemberOrOwner || isStrong
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  return { allowed: true }
}

/* ----------------- */
// ACTION POLICIES
/* -------- */

const createOrganisationPolicy: OrganisationPolicyHandler = params => {
  if (!hasAuthenticatedSession(params) || !params.userId) {
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
  if (!hasAuthenticatedSession(params) || !params.userId) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  return evaluateOrganisationReadStatePolicy(params)
}

const listOrganisationsPolicy: OrganisationPolicyHandler = params => {
  if (!hasAuthenticatedSession(params) || !params.userId) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  if (
    params.requestedState?.isArchived === undefined ||
    params.requestedState?.isPublished === undefined
  ) {
    return { allowed: false, code: 'REQUEST_STATE_REQUIRED' }
  }

  const isArchived = params.requestedState.isArchived
  const isPublished = params.requestedState.isPublished
  const isStrong = isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  const hasOrgMembership = hasAnyOrganisationRole(params.userRoles)

  if (isArchived) {
    return isStrong ? { allowed: true } : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (!isPublished) {
    return hasOrgMembership || isStrong
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  return { allowed: true }
}

const updateOrganisationPolicy: OrganisationPolicyHandler = params => {
  if (!hasAuthenticatedSession(params) || !params.userId) {
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
  if (!hasAuthenticatedSession(params) || !params.userId) {
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
// INPUT NORMALIZERS
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

/* ----------------- */
// ACTOR RESOLUTION
/* -------- */

export const toOrganisationAuthActor = (user: unknown): OrganisationAuthActor => {
  if (!user || typeof user !== 'object') {
    return {
      userId: undefined,
      userRoles: [],
      isAuthenticated: false,
      isAnonymous: false,
    }
  }

  const userId = (() => {
    const value = (user as { id?: unknown }).id
    return typeof value === 'string' ? value : undefined
  })()
  const userRoles = (() => {
    const value = (user as { roles?: unknown }).roles
    return Array.isArray(value) ? (value as UserRoleDisco[]) : []
  })()
  const isAnonymous = (user as { isAnonymous?: unknown }).isAnonymous === true

  return {
    userId,
    userRoles,
    isAuthenticated: Boolean(userId) && !isAnonymous,
    isAnonymous,
  }
}

const toOrganisationSubmissionActor = (
  user: { id: string; isAnonymous?: boolean },
  userRoles: UserRoleDisco[],
): OrganisationAuthActor => ({
  ...toOrganisationAuthActor({
    id: user.id,
    isAnonymous: user.isAnonymous,
    roles: userRoles,
  }),
  userRoles,
})

/* ----------------- */
// READ/LIST AUTHORIZATION
/* -------- */

export const authorizeOrganisationRead = (
  actor: OrganisationAuthActor,
  target: OrganisationAuthTarget,
  requestedState: { isPublished: boolean; isArchived: boolean },
): AuthorizationDecision =>
  readOrganisationPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    isAnonymous: actor.isAnonymous,
    resourceType: 'organisation',
    action: 'readOrganisation',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
    requestedState,
  })

export const authorizeOrganisationReadForProbe = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  probe: {
    id: string
    hubId: string | null
    isPublished: boolean
    isArchived: boolean
  }
}): AuthorizationDecision =>
  authorizeOrganisationRead(
    toOrganisationSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.probe.id,
      resourceHubId: params.probe.hubId,
    },
    {
      isPublished: params.probe.isPublished,
      isArchived: params.probe.isArchived,
    },
  )

export const authorizeOrganisationList = (
  actor: OrganisationAuthActor,
  target: Pick<OrganisationAuthTarget, 'resourceHubId'>,
  requestedState: { isPublished: boolean; isArchived: boolean },
): AuthorizationDecision =>
  listOrganisationsPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    isAnonymous: actor.isAnonymous,
    resourceType: 'organisation',
    action: 'listOrganisations',
    resourceHubId: target.resourceHubId,
    requestedState,
  })

export const authorizeOrganisationListForContext = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  hub: { id?: string | null; isCore?: boolean } | null | undefined
  requestedListState: { isPublished: boolean; isArchived: boolean }
}): AuthorizationDecision =>
  authorizeOrganisationList(
    toOrganisationSubmissionActor(params.user, params.userRoles),
    {
      resourceHubId: params.hub?.isCore ? null : (params.hub?.id ?? null),
    },
    params.requestedListState,
  )

/* ----------------- */
// WRITE AUTHORIZATION
/* -------- */

export const authorizeOrganisationCreate = (
  actor: OrganisationAuthActor,
  target: Pick<OrganisationAuthTarget, 'resourceHubId'>,
  fields: OrganisationAuthorizationField[],
): AuthorizationDecision =>
  createOrganisationPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    isAnonymous: actor.isAnonymous,
    resourceType: 'organisation',
    action: 'createOrganisation',
    resourceHubId: target.resourceHubId,
    fields,
  })

export const authorizeOrganisationCreateForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resourceHubId: string | null
  submittedData: Partial<Record<OrganisationAuthorizationField, unknown>>
}): AuthorizationDecision =>
  authorizeOrganisationCreate(
    toOrganisationSubmissionActor(params.user, params.userRoles),
    { resourceHubId: params.resourceHubId },
    toOrganisationSubmittedFields(params.submittedData),
  )

export const authorizeOrganisationUpdate = (
  actor: OrganisationAuthActor,
  target: Required<OrganisationAuthTarget>,
  fields: OrganisationAuthorizationField[],
): AuthorizationDecision =>
  updateOrganisationPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    isAnonymous: actor.isAnonymous,
    resourceType: 'organisation',
    action: 'updateOrganisation',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
    fields,
  })

export const authorizeOrganisationUpdateForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; hubId: string | null }
  submittedData: Partial<Record<OrganisationAuthorizationField, unknown>>
}): AuthorizationDecision =>
  authorizeOrganisationUpdate(
    toOrganisationSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.resource.id,
      resourceHubId: params.resource.hubId,
    },
    toOrganisationSubmittedFields(params.submittedData),
  )

export const authorizeOrganisationManageRoles = (
  actor: OrganisationAuthActor,
  target: Required<OrganisationAuthTarget>,
): AuthorizationDecision =>
  manageOrganisationRolesPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    isAnonymous: actor.isAnonymous,
    resourceType: 'organisation',
    action: 'manageOrganisationRoles',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
    fields: ['userRoles'],
  })

export const authorizeOrganisationManageRolesForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; hubId: string | null }
}): AuthorizationDecision =>
  authorizeOrganisationManageRoles(
    toOrganisationSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.resource.id,
      resourceHubId: params.resource.hubId,
    },
  )

export const authorizeOrganisationPublish = (
  actor: OrganisationAuthActor,
  target: Required<OrganisationAuthTarget>,
): AuthorizationDecision =>
  publishOrganisationPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    isAnonymous: actor.isAnonymous,
    resourceType: 'organisation',
    action: 'publishOrganisation',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
    fields: ['isPublished'],
  })

export const authorizeOrganisationPublishForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; hubId: string | null }
}): AuthorizationDecision =>
  authorizeOrganisationPublish(
    toOrganisationSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.resource.id,
      resourceHubId: params.resource.hubId,
    },
  )

export const authorizeOrganisationDelete = (
  actor: OrganisationAuthActor,
  target: Pick<OrganisationAuthTarget, 'resourceHubId'>,
): AuthorizationDecision =>
  deleteOrganisationPolicy({
    userId: actor.userId,
    userRoles: actor.userRoles,
    isAuthenticated: actor.isAuthenticated,
    isAnonymous: actor.isAnonymous,
    resourceType: 'organisation',
    action: 'deleteOrganisation',
    resourceHubId: target.resourceHubId,
  })

export const authorizeOrganisationDeleteForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resource: { hubId: string | null }
}): AuthorizationDecision =>
  authorizeOrganisationDelete(
    toOrganisationSubmissionActor(params.user, params.userRoles),
    {
      resourceHubId: params.resource.hubId,
    },
  )

/* ----------------- */
// COMMAND AUTHORIZATION
/* -------- */

export const ensureOrganisationCommandAllowed = (
  decision: AuthorizationDecision,
): void => {
  if (!decision.allowed) {
    throw error(403, toAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
  }
}

/* ----------------- */
// ACTION PERMISSIONS
/* -------- */

export const resolveOrganisationActionPermissions = (
  actor: OrganisationAuthActor,
  target: OrganisationAuthTarget | null | undefined,
  fields: OrganisationAuthorizationField[] = ['code'],
): OrganisationActionPermissions => {
  const canCreate =
    target?.resourceHubId === undefined
      ? false
      : authorizeOrganisationCreate(
          actor,
          {
            resourceHubId: target.resourceHubId,
          },
          fields,
        ).allowed

  if (!target?.resourceId || target.resourceHubId === undefined) {
    return { canCreate, canEdit: false, canPublish: false }
  }

  return {
    canCreate,
    canEdit: authorizeOrganisationUpdate(
      actor,
      {
        resourceId: target.resourceId,
        resourceHubId: target.resourceHubId,
      },
      fields,
    ).allowed,
    canPublish: authorizeOrganisationPublish(actor, {
      resourceId: target.resourceId,
      resourceHubId: target.resourceHubId,
    }).allowed,
  }
}

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
