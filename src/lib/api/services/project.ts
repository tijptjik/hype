// DRIZZLE
import { eq, inArray, or, type SQL } from 'drizzle-orm'
// CAPABILITIES
import {
  getCapabilityKeysFromDefinitions,
  isProjectCapabilityKey,
  normalizeProjectCapabilities,
  normalizeProjectRoleCapabilities,
} from '$lib/capabilities'
// API
import { applyQueryFilters, removeExcludedColumns } from '$lib/api'
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  runAssertions,
  assertOrganisationOwnerOrSuperAdmin,
  assertProjectMaintainerOrSuperAdmin,
} from '$lib/auth/asserts'
// DB
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
import { isSuperAdmin } from '$lib/client/services/auth'
// SCHEMA
import { project, property as propertyTable } from '$lib/db/schema/index'
// DB
import { applyPrismConstraints, isFieldUnique } from '$lib/db'
import {
  toEntityResponseShape as toProjectEntityResponseShapeFromDb,
  toListResponseShape as toProjectListResponseShapeFromDb,
  toResponseShape as toProjectResponseShapeFromDb,
} from '$lib/db/services/project'
import { FirstClassResource, HierarchicalResource, ProjectRoleType } from '$lib/enums'
import {
  inferPropertyDiscriminatorFromComponent,
  toBooleanOrUndefined,
} from '$lib/api/services'
// TYPES
import type {
  CapabilityDefinitions,
  UserRoleDisco,
  SubmittedPropertyScopeCandidate,
  ProjectInheritedPropertySyncItem,
  ProjectLocalPropertyCandidate,
  PersistedProjectLocalPropertyCandidate,
  ProjectNew,
  Prisms,
  ProjectDB,
  ProjectDBRaw,
  ProjectProfile,
  ProjectI18nNew,
  ProjectRoleNew,
  Database,
  Id,
  ListResponse,
  ProjectEntityByProfile,
  ProjectListByProfile,
  PropertyDBRaw,
  QueryParams,
  Project,
  SessionUser,
  EntityResponse,
} from '$lib/types'
import type { SuperValidated } from 'sveltekit-superforms'

/********************
 *  COMMON
 ************/
export const projectCollectionWithRelations = {
  i18n: true,
  image: true,
}

export const projectEntityWithRelations = {
  i18n: true,
  userRoles: {
    with: {
      user: {
        columns: userColumnsWithPrivacyProtected,
      },
    },
  },
  properties: {
    with: {
      i18n: true,
      values: {
        with: {
          i18n: true,
        },
      },
    },
  },
  image: true,
  publisher: true,
}

export const getProjectWithRelations = (profile: ProjectProfile) => {
  if (profile === 'admin') {
    return projectEntityWithRelations
  }

  if (profile === 'card' || profile === 'detail') {
    return projectCollectionWithRelations
  }

  return {
    i18n: true,
  }
}

const projectProfiles = ['list', 'card', 'detail', 'admin'] as const

export const toProjectProfile = (
  value: unknown,
  fallback: ProjectProfile,
): ProjectProfile =>
  typeof value === 'string' && (projectProfiles as readonly string[]).includes(value)
    ? (value as ProjectProfile)
    : fallback

/**
 * Shapes a project row into a profile-specific wire response payload.
 *
 * @param project - Base project row.
 * @param i18n - Optional project i18n rows.
 * @param userRoles - Optional project role rows.
 * @param properties - Optional project property rows.
 * @param profile - Output response profile.
 * @returns Parsed project response payload.
 */
export const toResponseShape = async (
  project: ProjectDBRaw,
  i18n: ProjectI18nNew[] = [],
  userRoles: ProjectRoleNew[] = [],
  properties: PropertyDBRaw[] = [],
  profile: ProjectProfile = 'detail',
) => toProjectResponseShapeFromDb(project, i18n, userRoles, properties, profile)

/**
 * Shapes a single project entity into an API entity response envelope.
 *
 * @param project - Project row or `null`.
 * @param profile - Output response profile.
 * @returns Entity response envelope with typed project payload.
 */
export const toEntityResponseShape = async <P extends ProjectProfile = 'detail'>(
  project: ProjectDBRaw | null,
  profile: P = 'detail' as P,
): Promise<EntityResponse<ProjectEntityByProfile<P>>> =>
  toProjectEntityResponseShapeFromDb(project, profile)

/**
 * Shapes a paginated project result into an API list response envelope.
 *
 * @param result - Paginated project rows from DB service.
 * @param user - Optional session user.
 * @param profile - Output response profile.
 * @returns List response envelope with typed project payloads.
 */
export const toListResponseShape = async <P extends ProjectProfile = 'list'>(
  result: ListResponse<ProjectDBRaw>,
  user: SessionUser | undefined,
  profile: P = 'list' as P,
): Promise<ListResponse<ProjectListByProfile<P>>> =>
  toProjectListResponseShapeFromDb(result, user, profile)

export const normalizeSubmittedPropertyRanks = <
  T extends {
    type?: unknown
    component?: unknown
    rank?: unknown
    values?: unknown
  },
>(
  properties: T[],
): T[] => {
  const normalized = properties.map(property => ({ ...property }))
  const asRank = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value)
    }
    return Number.POSITIVE_INFINITY
  }

  normalized.forEach(property => {
    const inferredType = inferPropertyDiscriminatorFromComponent(property.component)
    if (inferredType) property.type = inferredType
  })

  normalized
    .map((property, index) => ({ property, index }))
    .sort((a, b) => {
      const aRank = asRank(a.property.rank)
      const bRank = asRank(b.property.rank)
      if (aRank !== bRank) return aRank - bRank
      return a.index - b.index
    })
    .forEach(({ property }, rank) => {
      property.rank = rank
    })

  for (const property of normalized) {
    if (!Array.isArray(property.values)) continue
    const values = property.values as Array<
      { rank?: unknown } & Record<string, unknown>
    >
    property.values = values
      .map((value, index) => ({ value: { ...value }, index }))
      .sort((a, b) => {
        const aRank = asRank(a.value.rank)
        const bRank = asRank(b.value.rank)
        if (aRank !== bRank) return aRank - bRank
        return a.index - b.index
      })
      .map(({ value }, rank) => ({
        ...value,
        rank,
      }))
  }

  return normalized as T[]
}

/**
 * Resolves submitted property scope using canonical DB scope when available.
 * @param property Submitted property candidate.
 * @param canonicalScopeByPropertyId Canonical scope lookup keyed by property id.
 * @returns Resolved scope string or `undefined` when no scope is available.
 */
const resolveSubmittedPropertyScope = (
  property: SubmittedPropertyScopeCandidate,
  canonicalScopeByPropertyId: Map<string, string>,
): string | undefined => {
  const canonicalScope =
    typeof property?.id === 'string'
      ? canonicalScopeByPropertyId.get(property.id)
      : undefined
  return (
    canonicalScope ?? (typeof property.scope === 'string' ? property.scope : undefined)
  )
}

/**
 * Splits submitted properties into local (`project`) and inherited scopes.
 * @param properties Submitted properties.
 * @param canonicalScopeByPropertyId Canonical scope lookup keyed by property id.
 * @returns Grouped submitted properties by local and inherited scope.
 */
export const splitSubmittedPropertiesByScope = <
  T extends SubmittedPropertyScopeCandidate,
>(
  properties: T[],
  canonicalScopeByPropertyId: Map<string, string>,
): { local: T[]; inherited: T[] } => {
  const local: T[] = []
  const inherited: T[] = []

  for (const property of properties) {
    if (
      resolveSubmittedPropertyScope(property, canonicalScopeByPropertyId) === 'project'
    ) {
      local.push(property)
      continue
    }
    inherited.push(property)
  }

  return { local, inherited }
}

/**
 * Resolves canonical property scopes for submitted properties from persisted rows.
 * @param db Database handle.
 * @param properties Submitted properties that may include ids.
 * @returns Map of property id to canonical scope.
 */
export const resolveCanonicalScopeByPropertyId = async <
  T extends SubmittedPropertyScopeCandidate,
>(
  db: Database,
  properties: T[],
): Promise<Map<string, string>> => {
  const submittedPropertyIds = properties
    .map(property => property?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  const canonicalScopeByPropertyId = new Map<string, string>()
  if (submittedPropertyIds.length === 0) {
    return canonicalScopeByPropertyId
  }

  const scopeRows = await db.query.property.findMany({
    columns: { id: true, scope: true },
    where: inArray(propertyTable.id, submittedPropertyIds),
  })

  for (const scopeRow of scopeRows) {
    canonicalScopeByPropertyId.set(scopeRow.id, scopeRow.scope)
  }

  return canonicalScopeByPropertyId
}

/**
 * Normalizes submitted local properties into project-scoped persisted candidates.
 * @param properties Submitted local properties.
 * @param projectId Target project id.
 * @returns Local properties with enforced project linkage and scope defaults.
 */
export const toSubmittedLocalPropertiesWithProjectId = <
  T extends ProjectLocalPropertyCandidate,
>(
  properties: T[],
  projectId: Id,
): Array<T & { projectId: Id; hubId: null; scope: 'project'; isEnabled: true }> =>
  properties.map(property => ({
    ...property,
    projectId,
    hubId: null,
    scope: 'project',
    isEnabled: true,
  }))

/**
 * Collects a set of valid property ids from submitted property-like records.
 * @param properties Property-like records.
 * @returns Set of non-empty string ids.
 */
export const toSubmittedPropertyIdSet = <T extends { id?: unknown }>(
  properties: T[],
): Set<string> =>
  new Set(
    properties
      .map(property => property.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )

/**
 * Normalizes existing persisted project-local properties for re-persisting.
 * @param properties Existing local properties.
 * @param projectId Target project id.
 * @returns Local properties with enforced project linkage and project scope.
 */
export const toPersistedLocalPropertiesForProject = <
  T extends PersistedProjectLocalPropertyCandidate,
>(
  properties: T[],
  projectId: Id,
): Array<T & { projectId: Id; hubId: null; scope: 'project' }> =>
  properties.map(property => ({
    ...property,
    projectId,
    hubId: null,
    scope: 'project',
  }))

/**
 * Returns project-local properties that should be preserved when no local
 * properties are newly submitted.
 * @param params Existing local properties and submitted local ids.
 * @returns Preserved local properties normalized for persistence.
 */
export const toPreservedLocalPropertiesForProject = <
  T extends PersistedProjectLocalPropertyCandidate,
>(params: {
  existingLocalProperties: T[]
  submittedLocalPropertyIds: Set<string>
  projectId: Id
}): Array<T & { projectId: Id; hubId: null; scope: 'project' }> => {
  if (params.existingLocalProperties.length === 0) return []
  return toPersistedLocalPropertiesForProject(
    params.existingLocalProperties.filter(
      property => !params.submittedLocalPropertyIds.has(property.id),
    ),
    params.projectId,
  )
}

/**
 * Flattens local and inherited property groups into sync payload items.
 * @param groups Property groups to merge.
 * @returns Flat list compatible with inherited-property sync payloads.
 */
export const mergeProjectInheritedPropertySyncItems = (
  ...groups: Array<Array<Record<string, unknown>>>
): ProjectInheritedPropertySyncItem[] =>
  groups.flat() as unknown as ProjectInheritedPropertySyncItem[]

export const mergeProjectCapabilitiesForOrganisation = (
  projectCapabilities: unknown,
  organisationCapabilityDefinitions: CapabilityDefinitions | null | undefined,
) => {
  const merged = normalizeProjectCapabilities(projectCapabilities)
  const availableKeys = new Set(
    getCapabilityKeysFromDefinitions(organisationCapabilityDefinitions),
  )

  for (const key of Object.keys(merged)) {
    if (!isProjectCapabilityKey(key)) continue
    if (availableKeys.has(key)) continue
    merged[key] = false
  }

  return merged
}

export const sanitizeSubmittedRoleCapabilities = (
  submittedRoles: Array<{
    userId: string
    role: string
    capabilities?: unknown
  }>,
  projectCapabilities: ReturnType<typeof normalizeProjectCapabilities>,
) => {
  return submittedRoles.map(role => {
    const nextCapabilities = normalizeProjectRoleCapabilities(role.capabilities)
    for (const key of Object.keys(nextCapabilities)) {
      if (!isProjectCapabilityKey(key)) continue
      if (!projectCapabilities[key]) {
        nextCapabilities[key] = false
      }
    }
    if (role.role === ProjectRoleType.user) {
      for (const key of Object.keys(nextCapabilities)) {
        if (!isProjectCapabilityKey(key)) continue
        nextCapabilities[key] = false
      }
    }
    return {
      ...role,
      capabilities: nextCapabilities,
    }
  })
}

export const toLookupConditions = (params: {
  ref: string
  refKey?: 'id' | 'code'
}): Partial<ProjectDB> =>
  params.refKey === 'code'
    ? ({ code: params.ref } as Partial<ProjectDB>)
    : ({ id: params.ref as Id } as Partial<ProjectDB>)

export const toRequestedListState = (params: Partial<ProjectDB>) => ({
  isPublished: typeof params.isPublished === 'boolean' ? params.isPublished : true,
  isArchived: typeof params.isArchived === 'boolean' ? params.isArchived : false,
})

const VISIBILITY_COLUMNS = ['isArchived', 'isPublished'] as const

const toProjectRoleIds = (userRoles: UserRoleDisco[]): Id[] =>
  userRoles.filter(role => role.type === 'project').map(role => role.projectId as Id)

const toOrganisationRoleIds = (userRoles: UserRoleDisco[]): Id[] =>
  userRoles
    .filter(role => role.type === 'organisation')
    .map(role => role.organisationId as Id)

const toProjectPrisms = (prisms?: Prisms): Prisms | undefined => {
  if (!prisms) return undefined
  return {
    organisation: Array.isArray(prisms.organisation) ? prisms.organisation : [],
    project: [],
    layer: [],
  }
}

const applyTriStateBooleanCondition = (
  conditions: SQL<unknown>[],
  column: typeof project.isPublished | typeof project.isArchived,
  value: boolean | null | undefined,
) => {
  if (value === true) conditions.push(eq(column, true))
  if (value === false) conditions.push(eq(column, false))
}

export const buildVisibilityAndOwnershipConditions = (
  db: Database,
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms,
): {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const conditions: SQL<unknown>[] = []
  const excludeColumns = [...VISIBILITY_COLUMNS]
  const filteredParams = removeExcludedColumns(params, excludeColumns)

  const projectPrisms = toProjectPrisms(prisms)
  if (projectPrisms && db) {
    conditions.push(
      ...applyPrismConstraints(db, HierarchicalResource.project, projectPrisms),
    )
  }

  if (isSuperAdmin(user)) {
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  const projectIds = toProjectRoleIds(userRoles)
  const organisationIds = toOrganisationRoleIds(userRoles)

  if (isAdminRequest) {
    if (projectIds.length === 0 && organisationIds.length === 0) {
      conditions.push(eq(project.id, '__none__' as Id))
      return { filtersToApply: filteredParams, conditions, excludeColumns }
    }
    const ownershipScopes: SQL<unknown>[] = []
    if (projectIds.length > 0) ownershipScopes.push(inArray(project.id, projectIds))
    if (organisationIds.length > 0)
      ownershipScopes.push(inArray(project.organisationId, organisationIds))
    const ownershipCondition =
      ownershipScopes.length === 1 ? ownershipScopes[0] : or(...ownershipScopes)
    if (ownershipCondition) conditions.push(ownershipCondition)
  }

  const isPublished = toBooleanOrUndefined(params.isPublished)
  const isArchived = toBooleanOrUndefined(params.isArchived)

  applyTriStateBooleanCondition(
    conditions,
    project.isPublished,
    isPublished ?? (isAdminRequest ? undefined : true),
  )
  applyTriStateBooleanCondition(
    conditions,
    project.isArchived,
    isArchived ?? (isAdminRequest ? undefined : false),
  )

  if (!isAdminRequest && isPublished === false) {
    if (projectIds.length === 0 && organisationIds.length === 0) {
      conditions.push(eq(project.id, '__none__' as Id))
      return { filtersToApply: filteredParams, conditions, excludeColumns }
    }
    const membershipScopes: SQL<unknown>[] = []
    if (projectIds.length > 0) membershipScopes.push(inArray(project.id, projectIds))
    if (organisationIds.length > 0)
      membershipScopes.push(inArray(project.organisationId, organisationIds))
    const membershipCondition =
      membershipScopes.length === 1 ? membershipScopes[0] : or(...membershipScopes)
    if (membershipCondition) conditions.push(membershipCondition)
  }

  return { filtersToApply: filteredParams, conditions, excludeColumns }
}

/**
 * Get the query context for the project resource - filters the query based on the user's roles, prisms, and the query parameters.
 * @param db - The Drizzle instance
 * @param user - The user object
 * @param request - The request object
 * @param params - The query parameters
 * @param userRoles - The user roles
 * @param prisms - The prism filters
 */
export const toQueryConditions = (
  db: Database,
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms,
) => {
  const contextRespectingVisibilityAndOwnership = buildVisibilityAndOwnershipConditions(
    db,
    user,
    isAdminRequest,
    params,
    userRoles,
    prisms,
  )

  if (Object.keys(contextRespectingVisibilityAndOwnership.filtersToApply).length > 0) {
    applyQueryFilters(
      project,
      contextRespectingVisibilityAndOwnership.filtersToApply,
      contextRespectingVisibilityAndOwnership.conditions,
    )
  }

  return contextRespectingVisibilityAndOwnership
}

/**
 * Run assertions to check if the user has permissions to create a project
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToCreateProject = (
  user: SessionUser,
  request: Request,
  formData: ProjectNew,
  userRoles: UserRoleDisco[],
) => {
  const organisationId = formData.organisationId as Id
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user),
    () => assertAdminRequest(request),
    () => assertOrganisationOwnerOrSuperAdmin(user, userRoles, organisationId), // Only allow org owners to create projects
  )

  if (assertionError) return assertionError
}

/**
 * Get the context for updating a project
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @param refId - The code from the URL parameter
 * @returns Object containing validation and access control context
 * @remarks We don't need to assert code in params equals code in form,
 * as we want to allow the users to change the code of the project.
 */
export const assertPermissionsToUpdateProject = (
  user: SessionUser,
  request: Request,
  formData: ProjectDB,
  userRoles: UserRoleDisco[],
) => {
  const projectId = formData.id as Id
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user),
    () => assertAdminRequest(request),
    () => assertProjectMaintainerOrSuperAdmin(user, userRoles, projectId), // Only allow project maintainers to update projects
  )

  if (assertionError) return assertionError
}

export const assertCodeUnique = async (
  db: Database,
  form: SuperValidated<ProjectNew> | SuperValidated<Project>,
  formData: ProjectNew | Project,
) => {
  // ASSERT : Code is unique
  const codeUnique = await isFieldUnique<Project>(
    db,
    formData as Project,
    FirstClassResource.project,
    'code',
  )

  if (!codeUnique) {
    form.valid = false
    form.errors.code = ['Code already exists']
  }
  return form
}

/**
 * Check if the current user will lose access upon success, superAdmins are exempt.
 * @param formData - The form data
 * @param userRoles - The user roles
 * @param user - The user
 * @returns True if the current user will lose access upon success, false otherwise
 */
export const isAccessLostUponSuccess = (
  user: SessionUser,
  formData: { id?: string; userRoles: UserRoleDisco[] },
  userRoles?: UserRoleDisco[],
) => {
  const userRolesToCheck = userRoles || formData.userRoles
  return (
    !userRolesToCheck.some(
      role =>
        role.type === 'project' &&
        role.projectId === formData.id &&
        role.userId === user.id,
    ) && !user.superAdmin
  )
}
