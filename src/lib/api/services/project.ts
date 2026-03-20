// DRIZZLE
import { and, eq, inArray, or, type SQL } from 'drizzle-orm'
// CAPABILITIES
import {
  isProjectCapabilityKey,
  type normalizeProjectCapabilities,
  normalizeProjectRoleCapabilities,
} from '$lib/capabilities'
// API
import { applyQueryFilters, removeExcludedColumns } from '$lib/api'
import {
  inferPropertyDiscriminatorFromComponent,
  toBooleanOrUndefined,
} from '$lib/api/services'
import { isRelevantHubAdmin } from '$lib/api/services/authz'
// DB
import { applyPrismConstraints, transformI18nSafely } from '$lib/db'
import { applyTriStateBooleanCondition } from '$lib/db/query'
import { toImageEnvelope } from '$lib/db/services/image'
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
import {
  ProjectAdminProfileAPI,
  ProjectCardProfileAPI,
  ProjectDetailProfileAPI,
  ProjectListProfileAPI,
} from '$lib/db/zod/schema/project'
import { isSuperAdmin } from '$lib/client/services/auth'
// SCHEMA
import { project, property as propertyTable } from '$lib/db/schema/index'
// ENUMS
import { HierarchicalResource, ImageContextResource, ProjectRoleType } from '$lib/enums'
// TYPES
import type {
  Database,
  EntityResponse,
  Id,
  ListResponse,
  Prisms,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'
import type { Image } from '$lib/db/zod/schema/image.types'
import type {
  ProjectAdminDBRaw,
  ProjectCardDBRaw,
  ProjectDB,
  ProjectEntityByProfile,
  ProjectInheritedPropertySyncItem,
  ProjectListDBRaw,
  ProjectListByProfile,
  ProjectLocalPropertyCandidate,
  ProjectProfile,
  ProjectQueryRowByProfile,
  ProjectRoleCapabilities,
  PersistedProjectLocalPropertyCandidate,
  SubmittedPropertyScopeCandidate,
} from '$lib/db/zod/schema/project.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// DB RELATIONS
// - projectCollectionWithRelations
// - projectEntityWithRelations
// - getProjectWithRelations
//
// PROFILE SHAPING
// - toProjectProfile
// - toProfileResponseShape
// - toEntityResponseShape
// - toListResponseShape
//
// NORMALIZATION
// - normalizeSubmittedPropertyRanks
// - resolveSubmittedPropertyScope
// - splitSubmittedPropertiesByScope
// - resolveCanonicalScopeByPropertyId
// - toSubmittedLocalPropertiesWithProjectId
// - toSubmittedPropertyIdSet
// - toPersistedLocalPropertiesForProject
// - toPreservedLocalPropertiesForProject
// - mergeProjectInheritedPropertySyncItems
// - sanitizeSubmittedRoleCapabilities
//
// QUERY CONTEXT
// - toLookupConditions
// - toRequestedListState
// - toScopedProjectIds
// - toScopedOrganisationIds
// - toProjectPrisms
// - buildVisibilityAndOwnershipConditions
// - toQueryConditions

/********************
 *  DB RELATIONS
 ************/
/**
 * Lightweight relation graph for list/card/detail project reads.
 * Keeps common fetches small while preserving the fields needed for UI rendering.
 */
const projectCollectionWithRelations = {
  i18n: true,
  image: true,
  mapStyleAssignment: {
    with: {
      mapStyle: {
        with: {
          i18n: true,
        },
      },
    },
  },
}

/**
 * Full relation graph for admin-oriented project reads.
 * Includes role assignments and local properties required by mutation flows.
 */
const projectEntityWithRelations = {
  i18n: true,
  mapStyleAssignment: {
    with: {
      mapStyle: {
        with: {
          i18n: true,
        },
      },
    },
  },
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

type ProjectRelationsByProfile<P extends ProjectProfile> = P extends 'admin'
  ? typeof projectEntityWithRelations
  : P extends 'card' | 'detail'
    ? typeof projectCollectionWithRelations
    : { i18n: true }

/**
 * Resolves the relation graph required for the requested project profile.
 * Uses a lightweight graph for public/detail reads and the full graph for admin flows.
 *
 * @param profile - Requested response profile.
 * @returns Drizzle relation shape for the project query.
 */
export const getProjectWithRelations = <P extends ProjectProfile>(
  profile: P,
): ProjectRelationsByProfile<P> => {
  if (profile === 'admin') {
    return projectEntityWithRelations as ProjectRelationsByProfile<P>
  }

  if (profile === 'card' || profile === 'detail') {
    return projectCollectionWithRelations as ProjectRelationsByProfile<P>
  }

  return {
    i18n: true,
  } as ProjectRelationsByProfile<P>
}

/********************
 *  PROFILE SHAPING
 ************/
const projectProfiles = ['list', 'card', 'detail', 'admin'] as const

type ProjectResponseRow = ProjectDB & {
  i18n?: ProjectListDBRaw['i18n']
  image?: ProjectCardDBRaw['image']
  mapStyleAssignment?: ProjectCardDBRaw['mapStyleAssignment']
  properties?: ProjectAdminDBRaw['properties']
  publisher?: ProjectAdminDBRaw['publisher']
  userRoles?: ProjectAdminDBRaw['userRoles']
}

/**
 * Normalizes arbitrary profile input into a supported project profile.
 * Prevents invalid profile selectors from leaking into relation and schema branches.
 *
 * @param value - Raw caller-supplied profile value.
 * @param fallback - Profile returned when `value` is missing or invalid.
 * @returns Safe project profile.
 */
export const toProjectProfile = (
  value: unknown,
  fallback: ProjectProfile,
): ProjectProfile =>
  typeof value === 'string' && (projectProfiles as readonly string[]).includes(value)
    ? (value as ProjectProfile)
    : fallback

/**
 * Shapes a hydrated project row into a profile-specific API payload.
 * Keeps i18n, property, image, and role normalization centralized for all project responses.
 *
 * @param row - Hydrated project row.
 * @param i18n - Optional project i18n rows overriding relation payload.
 * @param userRoles - Optional project role rows overriding relation payload.
 * @param properties - Optional project property rows overriding relation payload.
 * @param profile - Target response profile.
 * @returns Parsed project payload for the requested profile.
 */
const toProfileResponseShape = async (
  row: ProjectResponseRow,
  i18n: NonNullable<ProjectResponseRow['i18n']> = [],
  userRoles: NonNullable<ProjectResponseRow['userRoles']> = [],
  properties: NonNullable<ProjectResponseRow['properties']> = [],
  profile: ProjectProfile = 'detail',
): Promise<ProjectEntityByProfile<ProjectProfile>> => {
  const imageProfile = profile === 'admin' ? 'admin' : profile
  const normalizedUserRoles = (userRoles ?? []).map(userRole => ({
    ...userRole,
    capabilities: userRole.capabilities ?? {},
  }))

  const data = {
    ...row,
    i18n: transformI18nSafely(i18n ?? []),
    userRoles: normalizedUserRoles,
    properties: (properties ?? []).map(property => ({
      ...property,
      i18n: transformI18nSafely(property.i18n as never),
      values:
        property.values?.map(value => ({
          ...value,
          i18n: transformI18nSafely(value.i18n as never),
        })) || [],
    })),
    image: row.image
      ? toImageEnvelope(
          row.image as Image,
          imageProfile,
          ImageContextResource.project,
          row.id,
        )
      : null,
    mapStyle: row.mapStyleAssignment?.mapStyle
      ? {
          ...row.mapStyleAssignment.mapStyle,
          i18n: transformI18nSafely(row.mapStyleAssignment.mapStyle.i18n ?? [], null),
        }
      : null,
  }

  if (profile === 'admin') {
    return ProjectAdminProfileAPI.parse(data) as ProjectEntityByProfile<ProjectProfile>
  }
  if (profile === 'detail') {
    return ProjectDetailProfileAPI.parse(data) as ProjectEntityByProfile<ProjectProfile>
  }
  if (profile === 'card') {
    return ProjectCardProfileAPI.parse(data) as ProjectEntityByProfile<ProjectProfile>
  }
  return ProjectListProfileAPI.parse(data) as ProjectEntityByProfile<ProjectProfile>
}

/**
 * Shapes a single project entity into an API entity response envelope.
 * Returns `data: null` on misses while preserving duration metadata.
 *
 * @param row - Project row or `null`.
 * @param profile - Output response profile.
 * @returns Entity response envelope with typed project payload.
 */
export const toEntityResponseShape = async <P extends ProjectProfile = 'detail'>(
  row: ProjectQueryRowByProfile<P> | null,
  profile: P = 'detail' as P,
): Promise<EntityResponse<ProjectEntityByProfile<P>>> => {
  const startedAt = Date.now()

  if (!row) {
    return { data: null, durationMs: Date.now() - startedAt }
  }

  const responseRow: ProjectResponseRow = row
  const data = await toProfileResponseShape(
    responseRow,
    responseRow.i18n ?? [],
    responseRow.userRoles ?? [],
    responseRow.properties ?? [],
    profile,
  )

  return {
    data: data as ProjectEntityByProfile<P>,
    durationMs: Date.now() - startedAt,
  }
}

/**
 * Shapes a paginated project result into an API list response envelope.
 * Every row is normalized through the same profile path used by entity reads.
 *
 * @param result - Paginated project rows from the DB layer.
 * @param _user - Unused session user kept for service signature compatibility.
 * @param profile - Output response profile.
 * @returns List response envelope with typed project payloads.
 */
export const toListResponseShape = async <P extends ProjectProfile = 'list'>(
  result: ListResponse<ProjectQueryRowByProfile<P>>,
  _user: SessionUser | undefined,
  profile: P = 'list' as P,
): Promise<ListResponse<ProjectListByProfile<P>>> => {
  const {
    data: rows,
    limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters,
    q,
    durationMs,
  } = result

  const data = await Promise.all(
    rows.map(async row => {
      try {
        const responseRow: ProjectResponseRow = row
        return await toProfileResponseShape(
          responseRow,
          responseRow.i18n ?? [],
          responseRow.userRoles ?? [],
          responseRow.properties ?? [],
          profile,
        )
      } catch (err) {
        console.error('[project.toListResponseShape] failed to shape project', {
          projectId: row.id,
          projectCode: row.code,
          profile,
          error: err,
        })
        throw err
      }
    }),
  )

  return {
    data: data as Array<ProjectListByProfile<P>>,
    limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters,
    q,
    durationMs,
  }
}

/********************
 *  NORMALIZATION
 ************/
/**
 * Produces a stable rank ordering for submitted properties and nested values.
 * This lets mutation handlers persist user-submitted arrays deterministically.
 *
 * @param properties - Submitted property-like records to normalize.
 * @returns Cloned property array with inferred `type` values and contiguous ranks.
 */
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
    .sort((left, right) => {
      const leftRank = asRank(left.property.rank)
      const rightRank = asRank(right.property.rank)
      if (leftRank !== rightRank) return leftRank - rightRank
      return left.index - right.index
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
      .sort((left, right) => {
        const leftRank = asRank(left.value.rank)
        const rightRank = asRank(right.value.rank)
        if (leftRank !== rightRank) return leftRank - rightRank
        return left.index - right.index
      })
      .map(({ value }, rank) => ({
        ...value,
        rank,
      }))
  }

  return normalized as T[]
}

/**
 * Resolves the effective scope for a submitted property candidate.
 * Persisted scope wins for existing property ids so clients cannot silently move inherited fields.
 *
 * @param property - Submitted property candidate.
 * @param canonicalScopeByPropertyId - Canonical scope lookup keyed by property id.
 * @returns Effective scope or `undefined` when none is available.
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
 * Splits submitted properties into project-local and inherited groups.
 * This keeps later persistence and sync steps explicit about ownership boundaries.
 *
 * @param properties - Submitted properties.
 * @param canonicalScopeByPropertyId - Canonical scope lookup keyed by property id.
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
 * Resolves canonical property scopes for submitted property ids from persisted rows.
 * Existing records are checked against the DB so scope-sensitive updates stay authoritative.
 *
 * @param db - Database handle.
 * @param properties - Submitted properties that may include ids.
 * @returns Map from property id to canonical scope.
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
 * Normalizes submitted local properties into persisted project-local candidates.
 * Enforces the parent linkage expected by downstream project-property persistence helpers.
 *
 * @param properties - Submitted local properties.
 * @param projectId - Target project id.
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
 * Used to preserve existing local properties that were not resubmitted in an update payload.
 *
 * @param properties - Property-like records.
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
 * Normalizes persisted project-local properties for re-persisting alongside submitted rows.
 * Keeps preserved locals aligned with the same shape produced for newly submitted local props.
 *
 * @param properties - Existing local properties.
 * @param projectId - Target project id.
 * @returns Local properties with enforced project linkage and project scope.
 */
const toPersistedLocalPropertiesForProject = <
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
 * Returns existing local properties that should be preserved during an update.
 * This prevents inherited-property syncs from deleting unrelated local project rows.
 *
 * @param params - Existing local properties and submitted local ids.
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
 * Flattens local and inherited property groups into the sync payload shape used by project updates.
 *
 * @param groups - Property groups to merge.
 * @returns Flat list compatible with inherited-property sync payloads.
 */
export const mergeProjectInheritedPropertySyncItems = (
  ...groups: Array<Array<Record<string, unknown>>>
): ProjectInheritedPropertySyncItem[] =>
  groups.flat() as unknown as ProjectInheritedPropertySyncItem[]

/**
 * Normalizes submitted project-role capability maps against the effective project capability set.
 * Prevents role payloads from granting permissions that the project itself does not expose.
 *
 * @param submittedRoles - Submitted project user-role rows.
 * @param projectCapabilities - Effective project capabilities after normalization.
 * @returns Submitted roles with invalid capability flags stripped or disabled.
 */
export const sanitizeSubmittedRoleCapabilities = (
  submittedRoles: Array<{
    userId: string
    role: string
    capabilities?: unknown
  }>,
  projectCapabilities: ReturnType<typeof normalizeProjectCapabilities>,
): Array<{
  userId: string
  role: string
  capabilities: ProjectRoleCapabilities
}> => {
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

/********************
 *  QUERY CONTEXT
 ************/
/**
 * Builds lookup conditions for project reads and updates.
 * Supports both id- and code-based references so shared handlers can target either route style.
 *
 * @param params - Route reference params.
 * @returns Partial project lookup object suitable for query param validation.
 */
export const toLookupConditions = (params: {
  ref: string
  refKey?: 'id' | 'code'
}): Partial<ProjectDB> =>
  params.refKey === 'code'
    ? ({ code: params.ref } as Partial<ProjectDB>)
    : ({ id: params.ref as Id } as Partial<ProjectDB>)

/**
 * Resolves default visibility state for project list requests.
 * Public callers default to published and non-archived records unless they ask otherwise.
 *
 * @param params - Partial project filter state.
 * @returns Normalized requested visibility flags.
 */
export const toRequestedListState = (params: Partial<ProjectDB>) => ({
  isPublished: typeof params.isPublished === 'boolean' ? params.isPublished : true,
  isArchived: typeof params.isArchived === 'boolean' ? params.isArchived : false,
})

const VISIBILITY_COLUMNS = ['isArchived', 'isPublished'] as const

/**
 * Extracts project ids from discovered roles using a role predicate.
 * Keeps query-time scope decisions aligned with authz policy tiers.
 *
 * @param userRoles - Resolved session role rows.
 * @param predicate - Role predicate for inclusion.
 * @returns Unique project ids the actor is directly assigned to.
 */
const toScopedProjectIds = (
  userRoles: UserRoleDisco[],
  predicate: (role: Extract<UserRoleDisco, { type: 'project' }>) => boolean,
): Id[] =>
  Array.from(
    new Set(
      userRoles
        .filter(
          (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
            role.type === 'project' &&
            typeof role.projectId === 'string' &&
            role.projectId.length > 0 &&
            predicate(role),
        )
        .map(role => role.projectId as Id),
    ),
  )

/**
 * Extracts organisation ids from discovered roles using a role predicate.
 * Organisation membership can grant scoped visibility into child projects.
 *
 * @param userRoles - Resolved session role rows.
 * @param predicate - Role predicate for inclusion.
 * @returns Unique organisation ids the actor belongs to.
 */
const toScopedOrganisationIds = (
  userRoles: UserRoleDisco[],
  predicate: (role: Extract<UserRoleDisco, { type: 'organisation' }>) => boolean,
): Id[] =>
  Array.from(
    new Set(
      userRoles
        .filter(
          (role): role is Extract<UserRoleDisco, { type: 'organisation' }> =>
            role.type === 'organisation' &&
            typeof role.organisationId === 'string' &&
            role.organisationId.length > 0 &&
            predicate(role),
        )
        .map(role => role.organisationId as Id),
    ),
  )

/**
 * Narrows prism input to the hierarchy levels project queries actually honor.
 * Project list queries apply organisation prisms here and intentionally discard deeper levels.
 *
 * @param prisms - Optional raw prism payload.
 * @returns Normalized project prism object or `undefined`.
 */
const toProjectPrisms = (prisms?: Prisms): Prisms | undefined => {
  if (!prisms) return undefined

  return {
    organisation: Array.isArray(prisms.organisation) ? prisms.organisation : [],
    project: [],
    layer: [],
  }
}

/**
 * Builds the project visibility and ownership SQL constraints for a query.
 * This is the query-composition counterpart to the higher-level auth policies used by remote handlers.
 *
 * @param db - Database handle used for prism constraint expansion.
 * @param user - Current session user.
 * @param isAdminRequest - Whether the request originated from an admin context.
 * @param params - Validated query params.
 * @param userRoles - Resolved session role rows.
 * @param prisms - Optional prism filters.
 * @param resourceHubId - Active hub scope used for scoped hub-admin elevation.
 * @returns Query context containing SQL conditions and filtered request params.
 */
const buildVisibilityAndOwnershipConditions = (
  db: Database,
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms,
  resourceHubId?: string | null,
): {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const conditions: SQL<unknown>[] = []
  const excludeColumns = [...VISIBILITY_COLUMNS]
  const filteredParams = removeExcludedColumns(params, excludeColumns)

  const projectPrisms = toProjectPrisms(prisms)
  if (projectPrisms) {
    conditions.push(
      ...applyPrismConstraints(db, HierarchicalResource.project, projectPrisms),
    )
  }

  if (isSuperAdmin(user)) {
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  const isHubAdmin = isRelevantHubAdmin(userRoles, resourceHubId)
  if (isHubAdmin) {
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  const ownerProjectIds = toScopedProjectIds(
    userRoles,
    role => role.role === ProjectRoleType.owner,
  )
  const nonUserProjectIds = toScopedProjectIds(
    userRoles,
    role => role.role !== ProjectRoleType.user,
  )
  const organisationIds = toScopedOrganisationIds(userRoles, () => true)

  const combineScopeCondition = (
    projectIds: Id[],
    organisationIds: Id[],
  ): SQL<unknown> | undefined => {
    const scopeConditions: SQL<unknown>[] = []

    if (projectIds.length > 0) {
      scopeConditions.push(inArray(project.id, projectIds))
    }
    if (organisationIds.length > 0) {
      scopeConditions.push(inArray(project.organisationId, organisationIds))
    }

    if (scopeConditions.length === 0) return undefined
    return scopeConditions.length === 1 ? scopeConditions[0] : or(...scopeConditions)
  }

  const isPublished = toBooleanOrUndefined(params.isPublished)
  const isArchived = toBooleanOrUndefined(params.isArchived)

  const ownerScopeCondition = combineScopeCondition(ownerProjectIds, organisationIds)
  const nonUserMembershipScopeCondition = combineScopeCondition(
    nonUserProjectIds,
    organisationIds,
  )

  const toScopedAccessCondition = (
    requestedIsPublished: boolean | undefined,
    requestedIsArchived: boolean | undefined,
  ): SQL<unknown> | undefined => {
    if (requestedIsArchived === true) {
      if (!ownerScopeCondition) return undefined
      return and(ownerScopeCondition, eq(project.isArchived, true))
    }

    if (requestedIsPublished === false) {
      if (!nonUserMembershipScopeCondition) return undefined

      const parts: SQL<unknown>[] = [
        nonUserMembershipScopeCondition,
        eq(project.isPublished, false),
      ]

      if (requestedIsArchived === false) {
        parts.push(eq(project.isArchived, false))
      }

      return parts.length === 1 ? parts[0] : and(...parts)
    }

    const publishedBranch = and(
      eq(project.isPublished, true),
      eq(project.isArchived, false),
    )
    if (requestedIsArchived === false || requestedIsArchived === undefined) {
      return publishedBranch
    }

    return undefined
  }

  const scopedAccessCondition = toScopedAccessCondition(isPublished, isArchived)

  if (!scopedAccessCondition) {
    conditions.push(eq(project.id, '__none__' as Id))
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  conditions.push(scopedAccessCondition)

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

  return { filtersToApply: filteredParams, conditions, excludeColumns }
}

/**
 * Produces final project query conditions after visibility scoping and generic filter composition.
 * Remote callers use this as the single entry point for list/get query construction.
 *
 * @param db - Database handle.
 * @param user - Current session user.
 * @param isAdminRequest - Whether the request originated from an admin context.
 * @param params - Validated query params.
 * @param userRoles - Resolved session role rows.
 * @param prisms - Optional prism filters.
 * @param resourceHubId - Active hub scope used for scoped hub-admin elevation.
 * @returns Query context containing SQL conditions, filter payload, and excluded columns.
 */
export const toQueryConditions = (
  db: Database,
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms,
  resourceHubId?: string | null,
): {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const contextRespectingVisibilityAndOwnership = buildVisibilityAndOwnershipConditions(
    db,
    user,
    isAdminRequest,
    params,
    userRoles,
    prisms,
    resourceHubId,
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
