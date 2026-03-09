import { error } from '@sveltejs/kit'
import { shouldLogAuthzDeny, toActorPolicyBase } from '.'
import { getScopedHubAdminIds, isCoreHubAdmin, isRelevantHubAdmin } from './hub'
import { hasAnyOrganisationRole, isOrganisationOwner } from './organisation'
import { hasAuthenticatedSession } from './user'
// TYPES
import type {
  AuthorizationDecision,
  ProjectAuthorizationAction,
  ProjectAuthorizeParams,
  ProjectAuthorizationField,
  UserRoleDisco,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. AUTH INPUT TYPES
//    - ProjectPolicyHandler (type)
//    - ProjectAuthActor (type)
//    - ProjectAuthTarget (type)
//
// 2. POLICY CONSTANTS
//    - PROJECT_AUTHZ_DENY_LOG_SCOPE
//    - PROJECT_CORE_ADMIN_ONLY_FIELDS
//    - PROJECT_HUB_ADMIN_ONLY_FIELDS
//    - logProjectReject
//
// 3. ROLE RESOLUTION
//    - hasAnyProjectRole
//    - hasProjectOwnerRole
//    - hasProjectTranslatorRole
//    - hasHubAdminRole
//    - canManageProject
//    - resolveProjectParentOrganisationScope
//    - canSetProjectParentOrganisation
//    - canCreateAnyProject
//
// 4. INPUT NORMALIZERS
//    - toProjectSubmittedFields
//    - toProjectStableAuthzSignature
//    - normalizeProjectI18nForFormInput
//    - toProjectUserRoleCapabilitiesSignature
//
// 5. ACTOR RESOLUTION
//    - toProjectAuthActor
//    - toProjectSubmissionActor
//    - toProjectPolicyBase
//
// 6. READ/LIST POLICY EVALUATION
//    - evaluateProjectListStatePolicy
//    - evaluateProjectReadStatePolicy
//
// 7. ACTION POLICIES
//    - listProjectsPolicy
//    - readProjectPolicy
//    - createProjectPolicy
//    - updateProjectPolicy
//    - deleteProjectPolicy
//    - manageProjectRolesPolicy
//    - publishProjectPolicy
//    - manageCapabilitiesPolicy
//    - assignCapabilitiesPolicy
//
// 8. READ/LIST AUTHORIZATION
//    - authorizeProjectList
//    - authorizeProjectListForContext
//    - authorizeProjectRead
//    - authorizeProjectReadForProbe
//
// 9. WRITE AUTHORIZATION
//    - authorizeProjectCreate
//    - authorizeProjectCreateForSubmission
//    - authorizeProjectUpdate
//    - authorizeProjectUpdateForSubmission
//    - authorizeProjectDelete
//    - authorizeProjectDeleteForSubmission
//    - authorizeProjectManageRoles
//    - authorizeProjectManageRolesForSubmission
//    - authorizeProjectPublish
//    - authorizeProjectPublishForSubmission
//    - authorizeProjectManageCapabilities
//    - authorizeProjectManageCapabilitiesForSubmission
//    - authorizeProjectAssignCapabilities
//    - authorizeProjectAssignCapabilitiesForSubmission
//
// 10. COMMAND AUTHORIZATION
//    - ensureProjectCommandAllowed
//
// 11. POLICY MAP
//    - projectPolicyMap

type ProjectPolicyHandler = (params: ProjectAuthorizeParams) => AuthorizationDecision

/* ----------------- */
// AUTH INPUT TYPES
/* -------- */

export type ProjectAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
}

export type ProjectAuthTarget = {
  resourceId?: string
  organisationId?: string | null
  resourceHubId?: string | null
}

export type ProjectParentOrganisationScope = {
  allowAll: boolean
  organisationIds: string[]
  hubIds: string[]
}

/* ----------------- */
// POLICY CONSTANTS
/* -------- */

const PROJECT_AUTHZ_DENY_LOG_SCOPE = '[authz][project][deny]'

const PROJECT_CORE_ADMIN_ONLY_FIELDS = new Set<ProjectAuthorizationField>([
  'organisationId',
])

const PROJECT_HUB_ADMIN_ONLY_FIELDS = new Set<ProjectAuthorizationField>([])

const logProjectReject = (
  scope: string,
  params: ProjectAuthorizeParams,
  code: AuthorizationDecision['code'],
  extra: Record<string, unknown> = {},
): AuthorizationDecision => {
  if (shouldLogAuthzDeny()) {
    console.log(`${PROJECT_AUTHZ_DENY_LOG_SCOPE}[${scope}]`, {
      code,
      action: params.action,
      userId: params.userId ?? null,
      isAuthenticated: params.isAuthenticated ?? null,
      isAnonymous: params.isAnonymous ?? null,
      isSuperAdmin: params.isSuperAdmin ?? false,
      userRoleCount: params.userRoles.length,
      hasAnyProjectRole: hasAnyProjectRole(params.userRoles),
      hasAnyOrganisationRole: hasAnyOrganisationRole(params.userRoles),
      hasHubAdminRole: hasHubAdminRole(params.userRoles),
      resourceId: params.resourceId ?? null,
      organisationId: params.organisationId ?? null,
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

const hasAnyProjectRole = (roles: UserRoleDisco[]): boolean =>
  roles.some(role => role.type === 'project')

const hasProjectOwnerRole = (roles: UserRoleDisco[], projectId?: string): boolean =>
  Boolean(projectId) &&
  roles.some(
    role =>
      role.type === 'project' && role.projectId === projectId && role.role === 'owner',
  )

const hasProjectTranslatorRole = (
  roles: UserRoleDisco[],
  projectId?: string,
): boolean =>
  Boolean(projectId) &&
  roles.some(
    role =>
      role.type === 'project' &&
      role.projectId === projectId &&
      role.role === 'translator',
  )

const hasProjectNonUserRole = (roles: UserRoleDisco[], projectId?: string): boolean =>
  Boolean(projectId) &&
  roles.some(
    role =>
      role.type === 'project' && role.projectId === projectId && role.role !== 'user',
  )

const hasAnyProjectNonUserRole = (roles: UserRoleDisco[]): boolean =>
  roles.some(role => role.type === 'project' && role.role !== 'user')

const hasAnyProjectOwnerRole = (roles: UserRoleDisco[]): boolean =>
  roles.some(role => role.type === 'project' && role.role === 'owner')

const hasAnyOrganisationOwnerRole = (roles: UserRoleDisco[]): boolean =>
  roles.some(role => role.type === 'organisation' && role.role === 'owner')

const hasOrganisationMembership = (
  roles: UserRoleDisco[],
  organisationId?: string,
): boolean =>
  Boolean(organisationId) &&
  roles.some(
    role => role.type === 'organisation' && role.organisationId === organisationId,
  )

const hasHubAdminRole = (roles: UserRoleDisco[]): boolean =>
  isCoreHubAdmin(roles) || getScopedHubAdminIds(roles).size > 0

const canManageProject = (roles: UserRoleDisco[], projectId?: string): boolean =>
  Boolean(projectId) &&
  roles.some(
    role =>
      role.type === 'project' &&
      role.projectId === projectId &&
      (role.role === 'maintainer' || role.role === 'owner'),
  )

const getOwnedOrganisationIds = (roles: UserRoleDisco[]): string[] =>
  roles
    .filter(
      (role): role is Extract<UserRoleDisco, { type: 'organisation' }> =>
        role.type === 'organisation' &&
        role.role === 'owner' &&
        typeof role.organisationId === 'string',
    )
    .map(role => role.organisationId)

const hasAnyOwnedOrganisation = (roles: UserRoleDisco[]): boolean =>
  getOwnedOrganisationIds(roles).length > 0

export const canCreateAnyProject = (
  actor: ProjectAuthActor,
  options: { resourceHubId?: string | null } = {},
): boolean => {
  if (actor.isSuperAdmin) return true
  if (isRelevantHubAdmin(actor.userRoles, options.resourceHubId)) return true
  return hasAnyOwnedOrganisation(actor.userRoles)
}

export const resolveProjectParentOrganisationScope = (params: {
  actor: ProjectAuthActor
  sourceHubId?: string | null
  createContextHubId?: string | null
  isCreateMode?: boolean
}): ProjectParentOrganisationScope => {
  if (params.actor.isSuperAdmin || isCoreHubAdmin(params.actor.userRoles)) {
    return {
      allowAll: true,
      organisationIds: [],
      hubIds: [],
    }
  }

  const organisationIds = getOwnedOrganisationIds(params.actor.userRoles)
  const scopedHubAdminIds = Array.from(getScopedHubAdminIds(params.actor.userRoles))
  const requestedHubIds =
    params.isCreateMode && typeof params.createContextHubId === 'string'
      ? [params.createContextHubId]
      : typeof params.sourceHubId === 'string'
        ? [params.sourceHubId]
        : []

  const hubIds = requestedHubIds.filter(hubId => scopedHubAdminIds.includes(hubId))

  return {
    allowAll: false,
    organisationIds,
    hubIds,
  }
}

export const canSetProjectParentOrganisation = (params: {
  actor: ProjectAuthActor
  source?: Required<
    Pick<ProjectAuthTarget, 'resourceId' | 'organisationId' | 'resourceHubId'>
  > | null
  createContextHubId?: string | null
  isCreateMode?: boolean
}): boolean => {
  if (params.isCreateMode) {
    return canCreateAnyProject(params.actor, {
      resourceHubId: params.createContextHubId,
    })
  }

  if (!params.source) return false

  const canDeleteSource = authorizeProjectDelete(params.actor, params.source).allowed
  if (!canDeleteSource) return false

  const scope = resolveProjectParentOrganisationScope({
    actor: params.actor,
    sourceHubId: params.source.resourceHubId,
    isCreateMode: false,
  })

  return scope.allowAll || scope.organisationIds.length > 0 || scope.hubIds.length > 0
}

/* ----------------- */
// INPUT NORMALIZERS
/* -------- */

export const toProjectSubmittedFields = (
  data: Partial<Record<ProjectAuthorizationField, unknown>>,
): ProjectAuthorizationField[] => {
  const fields: ProjectAuthorizationField[] = []
  if ('organisationId' in data) fields.push('organisationId')
  if ('code' in data) fields.push('code')
  if ('i18n' in data) fields.push('i18n')
  if ('capabilities' in data) fields.push('capabilities')
  if ('userRoles' in data) {
    fields.push('userRoles')
    fields.push('projectRoleCapabilities')
  }
  if ('properties' in data) fields.push('properties')
  if ('isPublished' in data) fields.push('isPublished')
  if ('isArchived' in data) fields.push('isArchived')
  return fields
}

const PROJECT_AUTHZ_DIFF_OMIT_KEYS = new Set([
  'createdAt',
  'modifiedAt',
  'projectId',
  'propertyId',
  'valueId',
])

const toAuthzComparable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(toAuthzComparable)
  if (!value || typeof value !== 'object') return value

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(
      ([key, fieldValue]) =>
        !PROJECT_AUTHZ_DIFF_OMIT_KEYS.has(key) && fieldValue !== undefined,
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, fieldValue]) => [key, toAuthzComparable(fieldValue)])

  return Object.fromEntries(entries)
}

export const toProjectStableAuthzSignature = (value: unknown): string => {
  return JSON.stringify(toAuthzComparable(value))
}

export const normalizeProjectI18nForFormInput = (
  i18n: unknown,
): Record<string, unknown> => {
  const source = (i18n ?? {}) as Record<string, Record<string, unknown>>
  const normalizeLocale = (locale: Record<string, unknown> | undefined) => ({
    name: locale?.name ?? '',
    nameShort: locale?.nameShort ?? '',
    description: locale?.description ?? '',
    license: locale?.license ?? '',
    attribution: locale?.attribution ?? '',
    nameGen: locale?.nameGen ?? false,
    nameShortGen: locale?.nameShortGen ?? false,
    descriptionGen: locale?.descriptionGen ?? false,
    licenseGen: locale?.licenseGen ?? false,
    attributionGen: locale?.attributionGen ?? false,
  })

  return {
    en: normalizeLocale(source.en),
    zhHans: normalizeLocale(source.zhHans),
    zhHant: normalizeLocale(source.zhHant),
  }
}

export const toProjectUserRoleCapabilitiesSignature = (
  userRoles: Array<{
    userId: string
    capabilities?: Record<string, boolean | undefined> | null
  }>,
): string =>
  userRoles
    .map(role => {
      const normalizedCapabilities = Object.entries(role.capabilities ?? {})
        .filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => `${key}:${value ? '1' : '0'}`)
        .join(',')
      return `${role.userId}|${normalizedCapabilities}`
    })
    .sort((a, b) => a.localeCompare(b))
    .join('||')

/* ----------------- */
// ACTOR RESOLUTION
/* -------- */

export const toProjectAuthActor = (user: unknown): ProjectAuthActor => {
  if (!user || typeof user !== 'object') {
    return {
      userId: undefined,
      userRoles: [],
      isAuthenticated: false,
      isAnonymous: false,
      isSuperAdmin: false,
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
  const isExplicitSuperAdmin = (user as { superAdmin?: unknown }).superAdmin === true
  const isSuperAdmin = isExplicitSuperAdmin || isCoreHubAdmin(userRoles)

  return {
    userId,
    userRoles,
    isAuthenticated: Boolean(userId) && !isAnonymous,
    isAnonymous,
    isSuperAdmin,
  }
}

const toProjectSubmissionActor = (
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean },
  userRoles: UserRoleDisco[],
): ProjectAuthActor => ({
  ...toProjectAuthActor({
    id: user.id,
    isAnonymous: user.isAnonymous,
    superAdmin: user.superAdmin,
    roles: userRoles,
  }),
  userRoles,
})

const toProjectPolicyBase = (
  actor: ProjectAuthActor,
): Pick<
  ProjectAuthorizeParams,
  'userId' | 'userRoles' | 'isAuthenticated' | 'isAnonymous' | 'isSuperAdmin'
> => toActorPolicyBase(actor)

/* ----------------- */
// READ/LIST POLICY EVALUATION
/* -------- */

const evaluateProjectListStatePolicy = (
  params: ProjectAuthorizeParams,
): AuthorizationDecision => {
  if (
    params.requestedState?.isArchived === undefined ||
    params.requestedState?.isPublished === undefined
  ) {
    return logProjectReject('list-state', params, 'REQUEST_STATE_REQUIRED')
  }

  const isArchived = params.requestedState.isArchived
  const isPublished = params.requestedState.isPublished
  const isStrong =
    Boolean(params.isSuperAdmin) ||
    isRelevantHubAdmin(params.userRoles, params.resourceHubId)
  const isOwner =
    hasAnyOrganisationOwnerRole(params.userRoles) ||
    hasAnyProjectOwnerRole(params.userRoles)
  const hasProjectMembership =
    hasAnyProjectNonUserRole(params.userRoles) ||
    hasAnyOrganisationRole(params.userRoles)

  if (isArchived) {
    return isStrong || isOwner
      ? { allowed: true }
      : logProjectReject('list-state', params, 'INSUFFICIENT_ROLE')
  }

  if (!isPublished) {
    return hasProjectMembership || isStrong
      ? { allowed: true }
      : logProjectReject('list-state', params, 'INSUFFICIENT_ROLE')
  }

  return { allowed: true }
}

const evaluateProjectReadStatePolicy = (
  params: ProjectAuthorizeParams,
): AuthorizationDecision => {
  if (
    params.requestedState?.isPublished === undefined ||
    params.requestedState?.isArchived === undefined
  ) {
    return logProjectReject('read-state', params, 'REQUEST_STATE_REQUIRED')
  }

  const canReadAdminResource =
    hasProjectNonUserRole(params.userRoles, params.resourceId) ||
    hasOrganisationMembership(params.userRoles, params.organisationId ?? undefined) ||
    isOrganisationOwner(params.userRoles, params.organisationId ?? undefined)
  const isOwner =
    isOrganisationOwner(params.userRoles, params.organisationId ?? undefined) ||
    hasProjectOwnerRole(params.userRoles, params.resourceId)
  const isStrong =
    Boolean(params.isSuperAdmin) ||
    isRelevantHubAdmin(params.userRoles, params.resourceHubId)

  if (params.requestedState.isArchived) {
    return isStrong || isOwner
      ? { allowed: true }
      : logProjectReject('read-state', params, 'INSUFFICIENT_ROLE')
  }

  if (!params.requestedState.isPublished) {
    return canReadAdminResource || isStrong
      ? { allowed: true }
      : logProjectReject('read-state', params, 'INSUFFICIENT_ROLE')
  }

  return { allowed: true }
}

/* ----------------- */
// ACTION POLICIES
/* -------- */

const listProjectsPolicy: ProjectPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logProjectReject('list', params, 'UNAUTHENTICATED')
  }

  return evaluateProjectListStatePolicy(params)
}

const readProjectPolicy: ProjectPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logProjectReject('read', params, 'UNAUTHENTICATED')
  }

  return evaluateProjectReadStatePolicy(params)
}

const createProjectPolicy: ProjectPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logProjectReject('create', params, 'UNAUTHENTICATED')
  }
  if (params.isSuperAdmin) return { allowed: true }

  const canCreate =
    isRelevantHubAdmin(params.userRoles, params.resourceHubId) ||
    isOrganisationOwner(params.userRoles, params.organisationId ?? undefined)

  return canCreate
    ? { allowed: true }
    : logProjectReject('create', params, 'INSUFFICIENT_ROLE')
}

const updateProjectPolicy: ProjectPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logProjectReject('update', params, 'UNAUTHENTICATED')
  }
  if (params.isSuperAdmin) return { allowed: true }

  const canManage =
    isRelevantHubAdmin(params.userRoles, params.resourceHubId) ||
    canManageProject(params.userRoles, params.resourceId) ||
    isOrganisationOwner(params.userRoles, params.organisationId ?? undefined)
  const canTranslateOnly =
    hasProjectTranslatorRole(params.userRoles, params.resourceId) &&
    (params.fields ?? []).length > 0 &&
    (params.fields ?? []).every(field => field === 'i18n')

  if (!canManage && !canTranslateOnly) {
    return logProjectReject('update', params, 'INSUFFICIENT_ROLE')
  }

  const actorIsCoreAdmin = isCoreHubAdmin(params.userRoles)
  const actorIsHubAdmin = isRelevantHubAdmin(params.userRoles, params.resourceHubId)

  for (const field of params.fields ?? []) {
    if (PROJECT_CORE_ADMIN_ONLY_FIELDS.has(field) && !actorIsCoreAdmin) {
      return logProjectReject('update', params, 'FIELD_FORBIDDEN', { field })
    }
    if (PROJECT_HUB_ADMIN_ONLY_FIELDS.has(field) && !actorIsHubAdmin) {
      return logProjectReject('update', params, 'FIELD_FORBIDDEN', { field })
    }
  }

  return { allowed: true }
}

const deleteProjectPolicy: ProjectPolicyHandler = params =>
  hasProjectOwnerRole(params.userRoles, params.resourceId)
    ? { allowed: true }
    : createProjectPolicy({ ...params, fields: ['isArchived'] })

const manageProjectRolesPolicy: ProjectPolicyHandler = params =>
  updateProjectPolicy({ ...params, fields: ['userRoles'] })

const publishProjectPolicy: ProjectPolicyHandler = params =>
  updateProjectPolicy({ ...params, fields: ['isPublished'] })

const manageCapabilitiesPolicy: ProjectPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logProjectReject('manage-capabilities', params, 'UNAUTHENTICATED')
  }
  if (params.isSuperAdmin) return { allowed: true }

  const canManage =
    isRelevantHubAdmin(params.userRoles, params.resourceHubId) ||
    isOrganisationOwner(params.userRoles, params.organisationId ?? undefined) ||
    hasProjectOwnerRole(params.userRoles, params.resourceId)

  return canManage
    ? { allowed: true }
    : logProjectReject('manage-capabilities', params, 'INSUFFICIENT_ROLE')
}

const assignCapabilitiesPolicy: ProjectPolicyHandler = params => {
  if (!hasAuthenticatedSession(params)) {
    return logProjectReject('assign-capabilities', params, 'UNAUTHENTICATED')
  }
  if (params.isSuperAdmin) return { allowed: true }

  const canAssign =
    isRelevantHubAdmin(params.userRoles, params.resourceHubId) ||
    isOrganisationOwner(params.userRoles, params.organisationId ?? undefined) ||
    canManageProject(params.userRoles, params.resourceId)

  return canAssign
    ? { allowed: true }
    : logProjectReject('assign-capabilities', params, 'INSUFFICIENT_ROLE')
}

/* ----------------- */
// READ/LIST AUTHORIZATION
/* -------- */

export const authorizeProjectList = (
  actor: ProjectAuthActor,
  target: Pick<ProjectAuthTarget, 'resourceHubId'>,
  requestedState: { isPublished?: boolean; isArchived?: boolean },
): AuthorizationDecision =>
  listProjectsPolicy({
    ...toProjectPolicyBase(actor),
    action: 'listProjects',
    resourceHubId: target.resourceHubId,
    requestedState,
  })

export const authorizeProjectListForContext = (params: {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  hub: { id?: string | null; isCore?: boolean } | null | undefined
  requestedListState: { isPublished: boolean; isArchived: boolean }
}): AuthorizationDecision =>
  authorizeProjectList(
    toProjectSubmissionActor(params.user, params.userRoles),
    { resourceHubId: params.hub?.isCore ? null : (params.hub?.id ?? null) },
    params.requestedListState,
  )

export const authorizeProjectRead = (
  actor: ProjectAuthActor,
  target: ProjectAuthTarget,
  options: { isPublished: boolean; isArchived: boolean },
): AuthorizationDecision =>
  readProjectPolicy({
    ...toProjectPolicyBase(actor),
    action: 'readProject',
    resourceId: target.resourceId,
    organisationId: target.organisationId,
    resourceHubId: target.resourceHubId,
    requestedState: options,
  })

export const authorizeProjectReadForProbe = (params: {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  probe: {
    id: string
    organisationId: string
    hubId: string | null
    isPublished: boolean
    isArchived: boolean
  }
}): AuthorizationDecision =>
  authorizeProjectRead(
    toProjectSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.probe.id,
      organisationId: params.probe.organisationId,
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

export const authorizeProjectCreate = (
  actor: ProjectAuthActor,
  target: Required<Pick<ProjectAuthTarget, 'organisationId'>> &
    Pick<ProjectAuthTarget, 'resourceHubId'>,
  fields: ProjectAuthorizationField[],
): AuthorizationDecision =>
  createProjectPolicy({
    ...toProjectPolicyBase(actor),
    action: 'createProject',
    organisationId: target.organisationId,
    resourceHubId: target.resourceHubId,
    fields,
  })

export const authorizeProjectCreateForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  organisationId: string
  resourceHubId: string | null
  submittedData: Partial<Record<ProjectAuthorizationField, unknown>>
}): AuthorizationDecision =>
  authorizeProjectCreate(
    toProjectSubmissionActor(params.user, params.userRoles),
    { organisationId: params.organisationId, resourceHubId: params.resourceHubId },
    toProjectSubmittedFields(params.submittedData),
  )

export const authorizeProjectUpdate = (
  actor: ProjectAuthActor,
  target: Required<
    Pick<ProjectAuthTarget, 'resourceId' | 'organisationId' | 'resourceHubId'>
  >,
  fields: ProjectAuthorizationField[],
): AuthorizationDecision =>
  updateProjectPolicy({
    ...toProjectPolicyBase(actor),
    action: 'updateProject',
    resourceId: target.resourceId,
    organisationId: target.organisationId,
    resourceHubId: target.resourceHubId,
    fields,
  })

export const authorizeProjectUpdateForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; organisationId: string; hubId: string | null }
  submittedData: Partial<Record<ProjectAuthorizationField, unknown>>
}): AuthorizationDecision =>
  authorizeProjectUpdate(
    toProjectSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.resource.id,
      organisationId: params.resource.organisationId,
      resourceHubId: params.resource.hubId,
    },
    toProjectSubmittedFields(params.submittedData),
  )

export const authorizeProjectDelete = (
  actor: ProjectAuthActor,
  target: Required<
    Pick<ProjectAuthTarget, 'resourceId' | 'organisationId' | 'resourceHubId'>
  >,
): AuthorizationDecision =>
  deleteProjectPolicy({
    ...toProjectPolicyBase(actor),
    action: 'deleteProject',
    resourceId: target.resourceId,
    organisationId: target.organisationId,
    resourceHubId: target.resourceHubId,
  })

export const authorizeProjectDeleteForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; organisationId: string; hubId: string | null }
}): AuthorizationDecision =>
  authorizeProjectDelete(toProjectSubmissionActor(params.user, params.userRoles), {
    resourceId: params.resource.id,
    organisationId: params.resource.organisationId,
    resourceHubId: params.resource.hubId,
  })

export const authorizeProjectManageRoles = (
  actor: ProjectAuthActor,
  target: Required<
    Pick<ProjectAuthTarget, 'resourceId' | 'organisationId' | 'resourceHubId'>
  >,
): AuthorizationDecision =>
  manageProjectRolesPolicy({
    ...toProjectPolicyBase(actor),
    action: 'manageProjectRoles',
    resourceId: target.resourceId,
    organisationId: target.organisationId,
    resourceHubId: target.resourceHubId,
  })

export const authorizeProjectManageRolesForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; organisationId: string; hubId: string | null }
}): AuthorizationDecision =>
  authorizeProjectManageRoles(toProjectSubmissionActor(params.user, params.userRoles), {
    resourceId: params.resource.id,
    organisationId: params.resource.organisationId,
    resourceHubId: params.resource.hubId,
  })

export const authorizeProjectPublish = (
  actor: ProjectAuthActor,
  target: Required<
    Pick<ProjectAuthTarget, 'resourceId' | 'organisationId' | 'resourceHubId'>
  >,
): AuthorizationDecision =>
  publishProjectPolicy({
    ...toProjectPolicyBase(actor),
    action: 'publishProject',
    resourceId: target.resourceId,
    organisationId: target.organisationId,
    resourceHubId: target.resourceHubId,
  })

export const authorizeProjectPublishForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; organisationId: string; hubId: string | null }
}): AuthorizationDecision =>
  authorizeProjectPublish(toProjectSubmissionActor(params.user, params.userRoles), {
    resourceId: params.resource.id,
    organisationId: params.resource.organisationId,
    resourceHubId: params.resource.hubId,
  })

export const authorizeProjectManageCapabilities = (
  actor: ProjectAuthActor,
  target: Required<
    Pick<ProjectAuthTarget, 'resourceId' | 'organisationId' | 'resourceHubId'>
  >,
): AuthorizationDecision =>
  manageCapabilitiesPolicy({
    ...toProjectPolicyBase(actor),
    action: 'manageCapabilities',
    resourceId: target.resourceId,
    organisationId: target.organisationId,
    resourceHubId: target.resourceHubId,
  })

export const authorizeProjectManageCapabilitiesForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; organisationId: string; hubId: string | null }
}): AuthorizationDecision =>
  authorizeProjectManageCapabilities(
    toProjectSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.resource.id,
      organisationId: params.resource.organisationId,
      resourceHubId: params.resource.hubId,
    },
  )

export const authorizeProjectAssignCapabilities = (
  actor: ProjectAuthActor,
  target: Required<
    Pick<ProjectAuthTarget, 'resourceId' | 'organisationId' | 'resourceHubId'>
  >,
): AuthorizationDecision =>
  assignCapabilitiesPolicy({
    ...toProjectPolicyBase(actor),
    action: 'assignCapabilities',
    resourceId: target.resourceId,
    organisationId: target.organisationId,
    resourceHubId: target.resourceHubId,
  })

export const authorizeProjectAssignCapabilitiesForSubmission = (params: {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string; organisationId: string; hubId: string | null }
}): AuthorizationDecision =>
  authorizeProjectAssignCapabilities(
    toProjectSubmissionActor(params.user, params.userRoles),
    {
      resourceId: params.resource.id,
      organisationId: params.resource.organisationId,
      resourceHubId: params.resource.hubId,
    },
  )

/* ----------------- */
// COMMAND AUTHORIZATION
/* -------- */

export const ensureProjectCommandAllowed = (
  decision: AuthorizationDecision,
  toMessage: (code: string) => string,
): void => {
  if (!decision.allowed) {
    throw error(403, toMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
  }
}

/* ----------------- */
// POLICY MAP
/* -------- */

export const projectPolicyMap: Record<
  ProjectAuthorizationAction,
  ProjectPolicyHandler
> = {
  listProjects: listProjectsPolicy,
  readProject: readProjectPolicy,
  createProject: createProjectPolicy,
  updateProject: updateProjectPolicy,
  deleteProject: deleteProjectPolicy,
  manageProjectRoles: manageProjectRolesPolicy,
  publishProject: publishProjectPolicy,
  manageCapabilities: manageCapabilitiesPolicy,
  assignCapabilities: assignCapabilitiesPolicy,
}
