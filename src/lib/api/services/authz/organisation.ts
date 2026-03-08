import { error } from '@sveltejs/kit'
import { shouldLogAuthzDeny, toActorPolicyBase, toAuthMessage } from '.'
import { getScopedHubAdminIds, isCoreHubAdmin, isRelevantHubAdmin } from './hub'
import { hasAuthenticatedSession } from './user'
// TYPES
import type {
  AuthorizationDecision,
  OrganisationAuthorizeParams,
  OrganisationActionPermissions,
  OrganisationAuthorizationAction,
  OrganisationAuthorizationField,
  UserRoleDisco,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. AUTH INPUT TYPES
//    - OrganisationPolicyHandler (type)
//    - OrganisationAuthActor (type)
//    - OrganisationAuthTarget (type)
//
// 2. POLICY CONSTANTS
//    - ORGANISATION_AUTHZ_DENY_LOG_SCOPE
//    - ORGANISATION_CORE_ADMIN_ONLY_FIELDS
//    - ORGANISATION_HUB_ADMIN_ONLY_FIELDS
//    - logOrganisationReject
//
// 3. ROLE RESOLUTION
//    - isOrganisationOwner
//    - hasOrganisationRole
//    - hasAnyOrganisationRole
//    - hasAnyOrganisationOwnerRole
//
// 4. INPUT NORMALIZERS
//    - toOrganisationSubmittedFields
//
// 5. ACTOR RESOLUTION
//    - toOrganisationAuthActor
//    - toOrganisationSubmissionActor
//    - toOrganisationPolicyBase
//
// 6. READ/LIST POLICY EVALUATION
//    - evaluateOrganisationReadStatePolicy
//    - evaluateOrganisationListStatePolicy
//
// 7. ACTION POLICIES
//    - listOrganisationsPolicy
//    - readOrganisationPolicy
//    - createOrganisationPolicy
//    - updateOrganisationPolicy
//    - deleteOrganisationPolicy
//    - manageOrganisationRolesPolicy
//    - publishOrganisationPolicy
//
// 8. READ/LIST AUTHORIZATION
//    - authorizeOrganisationList
//    - authorizeOrganisationListForContext
//    - authorizeOrganisationRead
//    - authorizeOrganisationReadForProbe
//
// 9. WRITE AUTHORIZATION
//    - authorizeOrganisationCreate
//    - authorizeOrganisationCreateForSubmission
//    - authorizeOrganisationUpdate
//    - authorizeOrganisationUpdateForSubmission
//    - authorizeOrganisationDelete
//    - authorizeOrganisationDeleteForSubmission
//    - authorizeOrganisationManageRoles
//    - authorizeOrganisationManageRolesForSubmission
//    - authorizeOrganisationPublish
//    - authorizeOrganisationPublishForSubmission
//
// 10. COMMAND AUTHORIZATION
//     - ensureOrganisationCommandAllowed
//
// 11. ACTION PERMISSIONS
//     - resolveOrganisationActionPermissions
//
// 12. POLICY MAP
//     - organisationPolicyMap

type OrganisationPolicyHandler = (
  params: OrganisationAuthorizeParams,
) => AuthorizationDecision

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

const ORGANISATION_AUTHZ_DENY_LOG_SCOPE = '[authz][organisation][deny]'

const logOrganisationReject = (
  scope: string,
  params: OrganisationAuthorizeParams,
  code: AuthorizationDecision['code'],
  extra: Record<string, unknown> = {},
): AuthorizationDecision => {
  if (shouldLogAuthzDeny()) {
    console.log(`${ORGANISATION_AUTHZ_DENY_LOG_SCOPE}[${scope}]`, {
      code,
      action: params.action,
      userId: params.userId ?? null,
      isAuthenticated: params.isAuthenticated ?? null,
      isAnonymous: params.isAnonymous ?? null,
      userRoleCount: params.userRoles.length,
      hasAnyOrganisationRole: hasAnyOrganisationRole(params.userRoles),
      resourceId: params.resourceId ?? null,
      resourceHubId: params.resourceHubId ?? null,
      fields: params.fields ?? null,
      requestedState: params.requestedState ?? null,
      ...extra,
    })
  }
  return { allowed: false, code }
}

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

const hasAnyOrganisationOwnerRole = (roles: UserRoleDisco[]): boolean =>
  roles.some(role => role.type === 'organisation' && role.role === 'owner')

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
  if ('properties' in data) fields.push('properties')
  return fields
}

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

const toOrganisationPolicyBase = (
  actor: OrganisationAuthActor,
): Pick<
  OrganisationAuthorizeParams,
  'userId' | 'userRoles' | 'isAuthenticated' | 'isAnonymous'
> => toActorPolicyBase(actor)

/* ----------------- */
// READ/LIST POLICY EVALUATION
/* -------- */

const evaluateOrganisationReadStatePolicy = (
  params: OrganisationAuthorizeParams,
): AuthorizationDecision => {
  if (
    params.requestedState?.isArchived === undefined ||
    params.requestedState?.isPublished === undefined
  ) {
    return logOrganisationReject('read-state', params, 'REQUEST_STATE_REQUIRED')
  }

  const isArchived = params.requestedState.isArchived
  const isPublished = params.requestedState.isPublished
  const isStrong = isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  const isMemberOrOwner = hasOrganisationRole(params.userRoles, params.resourceId)
  const isOwner = isOrganisationOwner(params.userRoles, params.resourceId)

  if (isArchived) {
    return isStrong || isOwner
      ? { allowed: true }
      : logOrganisationReject('read-state', params, 'INSUFFICIENT_ROLE')
  }

  if (!isPublished) {
    return isMemberOrOwner || isStrong
      ? { allowed: true }
      : logOrganisationReject('read-state', params, 'INSUFFICIENT_ROLE')
  }

  return { allowed: true }
}

const evaluateOrganisationListStatePolicy = (
  params: OrganisationAuthorizeParams,
): AuthorizationDecision => {
  if (
    params.requestedState?.isArchived === undefined ||
    params.requestedState?.isPublished === undefined
  ) {
    return logOrganisationReject('list-state', params, 'REQUEST_STATE_REQUIRED')
  }

  const isArchived = params.requestedState.isArchived
  const isPublished = params.requestedState.isPublished
  const isStrong = isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  const hasOrgMembership = hasAnyOrganisationRole(params.userRoles)
  const hasOrgOwnerRole = hasAnyOrganisationOwnerRole(params.userRoles)

  if (isArchived) {
    return isStrong || hasOrgOwnerRole
      ? { allowed: true }
      : logOrganisationReject('list-state', params, 'INSUFFICIENT_ROLE')
  }

  if (!isPublished) {
    return hasOrgMembership || isStrong
      ? { allowed: true }
      : logOrganisationReject('list-state', params, 'INSUFFICIENT_ROLE')
  }

  return { allowed: true }
}

/* ----------------- */
// ACTION POLICIES
/* -------- */

const listOrganisationsPolicy: OrganisationPolicyHandler = params => {
  if (!hasAuthenticatedSession(params) || !params.userId) {
    return logOrganisationReject('list', params, 'UNAUTHENTICATED')
  }

  return evaluateOrganisationListStatePolicy(params)
}

const readOrganisationPolicy: OrganisationPolicyHandler = params => {
  if (!hasAuthenticatedSession(params) || !params.userId) {
    return logOrganisationReject('read', params, 'UNAUTHENTICATED')
  }

  return evaluateOrganisationReadStatePolicy(params)
}

const createOrganisationPolicy: OrganisationPolicyHandler = params => {
  if (!hasAuthenticatedSession(params) || !params.userId) {
    return logOrganisationReject('create', params, 'UNAUTHENTICATED')
  }

  if (isCoreHubAdmin(params.userRoles)) return { allowed: true }

  if (!params.resourceHubId) {
    return logOrganisationReject('create', params, 'HUB_SCOPE_FORBIDDEN')
  }

  return getScopedHubAdminIds(params.userRoles).has(params.resourceHubId)
    ? { allowed: true }
    : logOrganisationReject('create', params, 'HUB_SCOPE_FORBIDDEN')
}

const updateOrganisationPolicy: OrganisationPolicyHandler = params => {
  if (!hasAuthenticatedSession(params) || !params.userId) {
    return logOrganisationReject('update', params, 'UNAUTHENTICATED')
  }

  const owner = isOrganisationOwner(params.userRoles, params.resourceId)
  const hubAdmin = isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  if (!owner && !hubAdmin) {
    return logOrganisationReject('update', params, 'INSUFFICIENT_ROLE')
  }

  const fields = params.fields ?? []
  const actorIsCoreAdmin = isCoreHubAdmin(params.userRoles)
  for (const field of fields) {
    if (ORGANISATION_CORE_ADMIN_ONLY_FIELDS.has(field) && !actorIsCoreAdmin) {
      return logOrganisationReject('update', params, 'FIELD_FORBIDDEN', { field })
    }
    if (ORGANISATION_HUB_ADMIN_ONLY_FIELDS.has(field) && !hubAdmin) {
      return logOrganisationReject('update', params, 'FIELD_FORBIDDEN', { field })
    }
  }

  return { allowed: true }
}

const deleteOrganisationPolicy: OrganisationPolicyHandler = params => {
  if (!hasAuthenticatedSession(params) || !params.userId) {
    return logOrganisationReject('delete', params, 'UNAUTHENTICATED')
  }

  const owner = isOrganisationOwner(params.userRoles, params.resourceId)
  const hubAdmin = isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  if (!owner && !hubAdmin) {
    return logOrganisationReject('delete', params, 'INSUFFICIENT_ROLE')
  }

  return { allowed: true }
}

const manageOrganisationRolesPolicy: OrganisationPolicyHandler = params => {
  if (!hasAuthenticatedSession(params) || !params.userId) {
    return logOrganisationReject('manage-roles', params, 'UNAUTHENTICATED')
  }

  const owner = isOrganisationOwner(params.userRoles, params.resourceId)
  const hubAdmin = isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  if (!owner && !hubAdmin) {
    return logOrganisationReject('manage-roles', params, 'INSUFFICIENT_ROLE')
  }

  return { allowed: true }
}

const publishOrganisationPolicy: OrganisationPolicyHandler = params =>
  updateOrganisationPolicy(params)

/* ----------------- */
// READ/LIST AUTHORIZATION
/* -------- */

export const authorizeOrganisationList = (
  actor: OrganisationAuthActor,
  target: Pick<OrganisationAuthTarget, 'resourceHubId'>,
  requestedState: { isPublished: boolean; isArchived: boolean },
): AuthorizationDecision =>
  listOrganisationsPolicy({
    ...toOrganisationPolicyBase(actor),
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

export const authorizeOrganisationRead = (
  actor: OrganisationAuthActor,
  target: OrganisationAuthTarget,
  requestedState: { isPublished: boolean; isArchived: boolean },
): AuthorizationDecision =>
  readOrganisationPolicy({
    ...toOrganisationPolicyBase(actor),
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

/* ----------------- */
// WRITE AUTHORIZATION
/* -------- */

export const authorizeOrganisationCreate = (
  actor: OrganisationAuthActor,
  target: Pick<OrganisationAuthTarget, 'resourceHubId'>,
  fields: OrganisationAuthorizationField[],
): AuthorizationDecision =>
  createOrganisationPolicy({
    ...toOrganisationPolicyBase(actor),
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
    ...toOrganisationPolicyBase(actor),
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

export const authorizeOrganisationDelete = (
  actor: OrganisationAuthActor,
  target: Required<OrganisationAuthTarget>,
): AuthorizationDecision =>
  deleteOrganisationPolicy({
    ...toOrganisationPolicyBase(actor),
    action: 'deleteOrganisation',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
  })

export const authorizeOrganisationDeleteForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; hubId: string | null }
}): AuthorizationDecision =>
  authorizeOrganisationDelete(
    toOrganisationSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.resource.id,
      resourceHubId: params.resource.hubId,
    },
  )

export const authorizeOrganisationManageRoles = (
  actor: OrganisationAuthActor,
  target: Required<OrganisationAuthTarget>,
): AuthorizationDecision =>
  manageOrganisationRolesPolicy({
    ...toOrganisationPolicyBase(actor),
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
    ...toOrganisationPolicyBase(actor),
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
  listOrganisations: listOrganisationsPolicy,
  readOrganisation: readOrganisationPolicy,
  createOrganisation: createOrganisationPolicy,
  updateOrganisation: updateOrganisationPolicy,
  deleteOrganisation: deleteOrganisationPolicy,
  manageOrganisationRoles: manageOrganisationRolesPolicy,
  publishOrganisation: publishOrganisationPolicy,
}
