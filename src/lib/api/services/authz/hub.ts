import { error } from '@sveltejs/kit'
import {
  shouldLogAuthzDeny,
  toActorPolicyBase,
  toAuthMessage,
  toUserRoleSignature,
} from '.'
// DRIZZLE
import { eq, inArray } from 'drizzle-orm'
// SCHEMA
import { hub, organisation } from '$lib/db/schema'
import { hasAuthenticatedSession } from './user'
// TYPES
import type { SQL } from 'drizzle-orm'
import type {
  AuthorizationDecision,
  Database,
  HubAuthorizationAction,
  HubAuthorizationField,
  HubAuthorizeParams,
  Id,
  UserRoleDisco,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. AUTH INPUT TYPES
//    - HubPolicyHandler (type)
//    - HubAuthActor (type)
//    - HubAuthTarget (type)
//    - HubAuthorizationAction (type)
//    - HubAuthorizationField (type)
//    - HubAuthorizeParams (type)
//
// 2. POLICY CONSTANTS
//    - CORE_HUB_CODE
//    - HUB_AUTHZ_DENY_LOG_SCOPE
//    - logHubReject
//
// 3. ROLE RESOLUTION
//    - isHubAdminRole
//    - isCoreHubAdmin
//    - getScopedHubAdminIds
//    - isRelevantHubAdmin
//    - resolveRoleHubId
//    - hasProjectPropertyEditorAccessToHub
//
// 4. INPUT NORMALIZERS
//    - toHubListConditions
//    - toHubSubmittedFields
//    - toHubUserRoleSignature
//
// 5. ACTOR RESOLUTION
//    - toHubAuthActor
//    - toHubSubmissionActor
//    - toHubPolicyBase
//
// 6. ACTION POLICIES
//    - listHubsPolicy
//    - readHubPolicy
//    - createHubPolicy
//    - updateHubPolicy
//    - deleteHubPolicy
//    - manageHubRolesPolicy
//    - publishHubPolicy
//
// 7. READ/LIST AUTHORIZATION
//    - authorizeHubList
//    - authorizeHubRead
//    - authorizeHubReadForProbe
//
// 8. WRITE AUTHORIZATION
//    - authorizeHubCreate
//    - authorizeHubCreateForSubmission
//    - authorizeHubUpdate
//    - authorizeHubUpdateForSubmission
//    - authorizeHubDelete
//    - authorizeHubDeleteForSubmission
//    - authorizeHubManageRoles
//    - authorizeHubManageRolesForSubmission
//    - authorizeHubPublish
//    - authorizeHubPublishForSubmission
//
// 9. ADDITIONAL GUARDS
//    - hasInvalidHubOrganisationAssignmentsForSubmission
//
// 10. COMMAND AUTHORIZATION
//    - ensureHubCommandAllowed
//
// 11. ACTION PERMISSIONS
//    - resolveHubActionPermissions
//
// 12. POLICY MAP
//    - hubPolicyMap

type HubPolicyHandler = (params: HubAuthorizeParams) => AuthorizationDecision

/* ----------------- */
// AUTH INPUT TYPES
/* -------- */

export type HubAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
}

export type HubAuthTarget = {
  resourceId?: string
  resourceHubId?: string | null
}

export type HubActionPermissions = {
  canCreate: boolean
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
}

export type HubRequestedListState = {
  isPublished?: boolean
  isArchived?: boolean
}

/* ----------------- */
// POLICY CONSTANTS
/* -------- */

export const CORE_HUB_CODE = 'core'

const HUB_AUTHZ_DENY_LOG_SCOPE = '[authz][hub][deny]'

const logHubReject = (
  scope: string,
  params: HubAuthorizeParams,
  code: AuthorizationDecision['code'],
  extra: Record<string, unknown> = {},
): AuthorizationDecision => {
  if (shouldLogAuthzDeny()) {
    console.log(`${HUB_AUTHZ_DENY_LOG_SCOPE}[${scope}]`, {
      code,
      action: params.action,
      userId: params.userId ?? null,
      isAuthenticated: params.isAuthenticated ?? null,
      isAnonymous: params.isAnonymous ?? null,
      userRoleCount: params.userRoles.length,
      resourceId: params.resourceId ?? null,
      resourceHubId: params.resourceHubId ?? null,
      fields: params.fields ?? null,
      ...extra,
    })
  }
  return { allowed: false, code }
}

/* ----------------- */
// ROLE RESOLUTION
/* -------- */

const isHubAdminRole = (role: UserRoleDisco): boolean =>
  role.type === 'hub' && role.role === 'admin'

export const isCoreHubAdmin = (roles: UserRoleDisco[]): boolean =>
  roles.some(
    role =>
      isHubAdminRole(role) &&
      (role as { hub?: { code?: string | null } }).hub?.code === CORE_HUB_CODE,
  )

export const getScopedHubAdminIds = (roles: UserRoleDisco[]): Set<string> =>
  new Set(
    roles
      .filter(role => isHubAdminRole(role))
      .filter(
        role =>
          (role as { hub?: { code?: string | null } }).hub?.code !== CORE_HUB_CODE,
      )
      .map(role => (role as { hubId: string }).hubId),
  )

export const isRelevantHubAdmin = (
  roles: UserRoleDisco[],
  resourceHubId?: string | null,
): boolean => {
  if (isCoreHubAdmin(roles)) return true
  if (!resourceHubId) return false
  return getScopedHubAdminIds(roles).has(resourceHubId)
}

const resolveRoleHubId = (role: UserRoleDisco): string | null => {
  if (role.type === 'hub') {
    return typeof role.hubId === 'string' ? role.hubId : null
  }

  if (role.type === 'organisation') {
    const directHubId = (role as { hubId?: unknown }).hubId
    if (typeof directHubId === 'string') return directHubId

    const relationHubId = (role as { organisation?: { hubId?: unknown } }).organisation
      ?.hubId
    return typeof relationHubId === 'string' ? relationHubId : null
  }

  if (role.type === 'project') {
    const directHubId = (role as { hubId?: unknown }).hubId
    if (typeof directHubId === 'string') return directHubId

    const projectHubId = (role as { project?: { hubId?: unknown } }).project?.hubId
    if (typeof projectHubId === 'string') return projectHubId

    const projectOrganisationHubId = (
      role as {
        project?: { organisation?: { hubId?: unknown } }
      }
    ).project?.organisation?.hubId
    return typeof projectOrganisationHubId === 'string'
      ? projectOrganisationHubId
      : null
  }

  return null
}

const hasProjectPropertyEditorAccessToHub = (
  roles: UserRoleDisco[],
  params: { resourceHubId?: string | null; resourceHubCode?: string | null },
): boolean => {
  // Core hub can be read by any actor who can edit project properties in any scope.
  if (params.resourceHubCode === CORE_HUB_CODE) {
    return roles.some(role => {
      if (role.type === 'organisation') return role.role === 'owner'
      if (role.type === 'project')
        return role.role === 'owner' || role.role === 'maintainer'
      return false
    })
  }

  if (!params.resourceHubId) return false

  return roles.some(role => {
    if (role.type === 'organisation' && role.role !== 'owner') return false
    if (
      role.type === 'project' &&
      role.role !== 'owner' &&
      role.role !== 'maintainer'
    ) {
      return false
    }
    if (role.type === 'hub') return false
    return resolveRoleHubId(role) === params.resourceHubId
  })
}

/* ----------------- */
// INPUT NORMALIZERS
/* -------- */

export const toHubListConditions = (
  roles: UserRoleDisco[],
  requestedListState: HubRequestedListState,
): SQL<unknown>[] => {
  const isCoreAdmin = isCoreHubAdmin(roles)
  const scopedHubIds = Array.from(getScopedHubAdminIds(roles))

  return [
    ...(!isCoreAdmin && scopedHubIds.length > 0 ? [inArray(hub.id, scopedHubIds)] : []),
    ...(!isCoreAdmin && scopedHubIds.length === 0
      ? [eq(hub.id, '__none__' as Id)]
      : []),
    ...(requestedListState.isPublished === undefined
      ? []
      : [eq(hub.isPublished, requestedListState.isPublished)]),
    ...(requestedListState.isArchived === undefined
      ? []
      : [eq(hub.isArchived, requestedListState.isArchived)]),
  ]
}

export const toHubSubmittedFields = (
  data: Partial<Record<HubAuthorizationField, unknown>>,
): HubAuthorizationField[] => {
  const fields: HubAuthorizationField[] = []
  if ('code' in data) fields.push('code')
  if ('domain' in data) fields.push('domain')
  if ('i18n' in data) fields.push('i18n')
  if ('userRoles' in data) fields.push('userRoles')
  if ('organisations' in data) fields.push('organisations')
  if ('isPublished' in data) fields.push('isPublished')
  if ('isArchived' in data) fields.push('isArchived')
  return fields
}

export const toHubUserRoleSignature = (
  userRoles: Array<{ userId: string; role: string }>,
): string => toUserRoleSignature(userRoles)

/* ----------------- */
// ACTOR RESOLUTION
/* -------- */

export const toHubAuthActor = (user: unknown): HubAuthActor => {
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

const toHubSubmissionActor = (
  user: { id: string; isAnonymous?: boolean },
  userRoles: UserRoleDisco[],
): HubAuthActor => ({
  ...toHubAuthActor({
    id: user.id,
    isAnonymous: user.isAnonymous,
    roles: userRoles,
  }),
  userRoles,
})

const toHubPolicyBase = (
  actor: HubAuthActor,
): Pick<
  HubAuthorizeParams,
  'userId' | 'userRoles' | 'isAuthenticated' | 'isAnonymous'
> => toActorPolicyBase(actor)

/* ----------------- */
// ACTION POLICIES
/* -------- */

const listHubsPolicy: HubPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logHubReject('list', params, 'UNAUTHENTICATED')
  }

  if (isCoreHubAdmin(params.userRoles)) {
    return { allowed: true }
  }

  if (!params.resourceHubId) {
    return logHubReject('list', params, 'HUB_SCOPE_FORBIDDEN')
  }

  return isRelevantHubAdmin(params.userRoles, params.resourceHubId)
    ? { allowed: true }
    : logHubReject('list', params, 'INSUFFICIENT_ROLE')
}

const readHubPolicy: HubPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logHubReject('read', params, 'UNAUTHENTICATED')
  }

  if (isRelevantHubAdmin(params.userRoles, params.resourceHubId)) {
    return { allowed: true }
  }

  if (
    hasProjectPropertyEditorAccessToHub(params.userRoles, {
      resourceHubId: params.resourceHubId,
      resourceHubCode: params.resourceHubCode,
    })
  ) {
    return { allowed: true }
  }

  return logHubReject('read', params, 'INSUFFICIENT_ROLE')
}

const createHubPolicy: HubPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logHubReject('create', params, 'UNAUTHENTICATED')
  }

  return isCoreHubAdmin(params.userRoles)
    ? { allowed: true }
    : logHubReject('create', params, 'HUB_SCOPE_FORBIDDEN')
}

const updateHubPolicy: HubPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logHubReject('update', params, 'UNAUTHENTICATED')
  }

  if (!params.resourceId) {
    return logHubReject('update', params, 'INSUFFICIENT_ROLE')
  }

  return isRelevantHubAdmin(params.userRoles, params.resourceHubId)
    ? { allowed: true }
    : logHubReject('update', params, 'INSUFFICIENT_ROLE')
}

const deleteHubPolicy: HubPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logHubReject('delete', params, 'UNAUTHENTICATED')
  }

  return isCoreHubAdmin(params.userRoles)
    ? { allowed: true }
    : logHubReject('delete', params, 'HUB_SCOPE_FORBIDDEN')
}

const manageHubRolesPolicy: HubPolicyHandler = params =>
  updateHubPolicy({ ...params, fields: ['userRoles'] })

const publishHubPolicy: HubPolicyHandler = params =>
  updateHubPolicy({ ...params, fields: ['isPublished'] })

/* ----------------- */
// READ/LIST AUTHORIZATION
/* -------- */

export const authorizeHubList = (
  actor: HubAuthActor,
  target: Pick<HubAuthTarget, 'resourceHubId'>,
): AuthorizationDecision =>
  listHubsPolicy({
    ...toHubPolicyBase(actor),
    action: 'listHubs',
    resourceHubId: target.resourceHubId,
  })

export const authorizeHubRead = (
  actor: HubAuthActor,
  target: Required<Pick<HubAuthTarget, 'resourceHubId'>> & {
    resourceHubCode?: string | null
  },
): AuthorizationDecision =>
  readHubPolicy({
    ...toHubPolicyBase(actor),
    action: 'readHub',
    resourceHubId: target.resourceHubId,
    resourceHubCode: target.resourceHubCode,
  })

export const authorizeHubReadForProbe = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  probe: { id: string; code: string }
}): AuthorizationDecision =>
  authorizeHubRead(toHubSubmissionActor(params.user, params.userRoles), {
    resourceHubId: params.probe.id,
    resourceHubCode: params.probe.code,
  })

/* ----------------- */
// WRITE AUTHORIZATION
/* -------- */

export const authorizeHubCreate = (
  actor: HubAuthActor,
  fields: HubAuthorizationField[],
): AuthorizationDecision =>
  createHubPolicy({
    ...toHubPolicyBase(actor),
    action: 'createHub',
    fields,
  })

export const authorizeHubCreateForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  submittedData: Partial<Record<HubAuthorizationField, unknown>>
}): AuthorizationDecision =>
  authorizeHubCreate(
    toHubSubmissionActor(params.user, params.userRoles),
    toHubSubmittedFields(params.submittedData),
  )

export const authorizeHubUpdate = (
  actor: HubAuthActor,
  target: Required<Pick<HubAuthTarget, 'resourceId' | 'resourceHubId'>>,
  fields: HubAuthorizationField[],
): AuthorizationDecision =>
  updateHubPolicy({
    ...toHubPolicyBase(actor),
    action: 'updateHub',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
    fields,
  })

export const authorizeHubUpdateForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string }
  submittedData: Partial<Record<HubAuthorizationField, unknown>>
}): AuthorizationDecision =>
  authorizeHubUpdate(
    toHubSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.resource.id,
      resourceHubId: params.resource.id,
    },
    toHubSubmittedFields(params.submittedData),
  )

export const authorizeHubDelete = (
  actor: HubAuthActor,
  target: Required<Pick<HubAuthTarget, 'resourceId' | 'resourceHubId'>>,
): AuthorizationDecision =>
  deleteHubPolicy({
    ...toHubPolicyBase(actor),
    action: 'deleteHub',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
  })

export const authorizeHubDeleteForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string }
}): AuthorizationDecision =>
  authorizeHubDelete(toHubSubmissionActor(params.user, params.userRoles), {
    resourceId: params.resource.id,
    resourceHubId: params.resource.id,
  })

export const authorizeHubManageRoles = (
  actor: HubAuthActor,
  target: Required<Pick<HubAuthTarget, 'resourceId' | 'resourceHubId'>>,
): AuthorizationDecision =>
  manageHubRolesPolicy({
    ...toHubPolicyBase(actor),
    action: 'manageHubRoles',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
  })

export const authorizeHubManageRolesForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string }
}): AuthorizationDecision =>
  authorizeHubManageRoles(toHubSubmissionActor(params.user, params.userRoles), {
    resourceId: params.resource.id,
    resourceHubId: params.resource.id,
  })

export const authorizeHubPublish = (
  actor: HubAuthActor,
  target: Required<Pick<HubAuthTarget, 'resourceId' | 'resourceHubId'>>,
): AuthorizationDecision =>
  publishHubPolicy({
    ...toHubPolicyBase(actor),
    action: 'publishHub',
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
  })

export const authorizeHubPublishForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string }
}): AuthorizationDecision =>
  authorizeHubPublish(toHubSubmissionActor(params.user, params.userRoles), {
    resourceId: params.resource.id,
    resourceHubId: params.resource.id,
  })

/* ----------------- */
// ADDITIONAL GUARDS
/* -------- */

export const hasInvalidHubOrganisationAssignmentsForSubmission = async (params: {
  db: Database
  user: { superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string }
  submittedOrganisations: Array<{ organisationId: string }>
}): Promise<boolean> => {
  if (params.user.superAdmin) return false

  const existingOrganisationRows = await params.db
    .select({ id: organisation.id })
    .from(organisation)
    .where(eq(organisation.hubId, params.resource.id))

  const existingOrganisationIds = new Set(existingOrganisationRows.map(row => row.id))
  const incomingOrganisationIds = params.submittedOrganisations.map(
    item => item.organisationId,
  )
  const addedOrganisationIds = incomingOrganisationIds.filter(
    organisationId => !existingOrganisationIds.has(organisationId),
  )
  if (addedOrganisationIds.length === 0) return false

  const memberOrganisationIds = new Set(
    params.userRoles
      .filter(role => role.type === 'organisation')
      .map(role => role.organisationId),
  )

  return addedOrganisationIds.some(
    organisationId => !memberOrganisationIds.has(organisationId),
  )
}

/* ----------------- */
// COMMAND AUTHORIZATION
/* -------- */

export const ensureHubCommandAllowed = (decision: AuthorizationDecision): void => {
  if (!decision.allowed) {
    throw error(403, toAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
  }
}

/* ----------------- */
// ACTION PERMISSIONS
/* -------- */

export const resolveHubActionPermissions = (
  actor: HubAuthActor,
  target: HubAuthTarget | null | undefined,
  fields: HubAuthorizationField[] = ['code'],
): HubActionPermissions => {
  const canCreate = authorizeHubCreate(actor, fields).allowed

  if (!target?.resourceId || target.resourceHubId === undefined) {
    return {
      canCreate,
      canEdit: false,
      canPublish: false,
      canDelete: false,
    }
  }

  const scopedTarget = {
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
  }

  return {
    canCreate,
    canEdit: authorizeHubUpdate(actor, scopedTarget, fields).allowed,
    canPublish: authorizeHubPublish(actor, scopedTarget).allowed,
    canDelete: authorizeHubDelete(actor, scopedTarget).allowed,
  }
}

/* ----------------- */
// POLICY MAP
/* -------- */

export const hubPolicyMap: Record<HubAuthorizationAction, HubPolicyHandler> = {
  listHubs: listHubsPolicy,
  readHub: readHubPolicy,
  createHub: createHubPolicy,
  updateHub: updateHubPolicy,
  deleteHub: deleteHubPolicy,
  manageHubRoles: manageHubRolesPolicy,
  publishHub: publishHubPolicy,
}
