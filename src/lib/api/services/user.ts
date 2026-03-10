// DRIZZLE
import {
  and,
  eq,
  exists,
  inArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm'
// API
import {
  applyQueryFilters,
  isAdminRequest,
  removeExcludedColumns,
  toTriStateBoolean,
} from '$lib/api'
import { isSuperAdmin } from '$lib/client/services/auth'
import { applyPrismConstraints } from '$lib/db'
// SCHEMA
import {
  feature,
  featureImage,
  user,
  hubRole,
  organisation,
  organisationRole,
  project,
  projectRole,
} from '$lib/db/schema/index'
import { getFeatureHubFilter } from '$lib/db/services/hub'
import { toSearchCondition } from '$lib/db/services/user'
// ZOD
import {
  UserAdminListProfileAPI,
  UserAdminProfileAPI,
  UserAttributionProfileAPI,
  UserCardProfileAPI,
  UserDetailProfileAPI,
  UserFeatureListProfileAPI,
  UserHydrationAttributionProfileAPI,
  UserHydrationCardProfileAPI,
  UserLeaderboardProfileAPI,
  UserSelfProfileAPI,
} from '$lib/db/zod'
// TYPES
import type {
  Database,
  Prisms,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import type {
  UserDB,
  UserEntityByProfile,
  UserHydrationEntityByProfile,
  UserHydrationProfile,
  UserParentChainRoleFilter,
  UserSearchQueryParams,
  UserProfileKey as UserProfileType,
  UserRaw,
  UserRoleEntityType,
  UserRoleFilter,
} from '$lib/db/zod/schema/user.types'
import type { z } from 'zod'
import { HierarchicalResource } from '$lib/enums'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// DB RELATIONS
// - userEntityWithRelations
//
// PROFILE SHAPING
// - toEntityResponseShape
// - toUserProfileResponseShape
// - toUserFeatureListResponseShape
// - toGroupedContributionIds
// - toUserContributionSummary
// - toRoleSummary
//
// PROFILE ASSEMBLY
// - toProfileData
//
// LOOKUP + SEARCH STATE
// - isPrivilegedArchivedSearchRequested
// - toRequestedSearchState
// - toUserLookupCondition
// - resolveUserProfile
// - toUserSearchPagingAndSorting
//
// ROLE FILTERS
// - toRoleConditions
// - toEntityRoleExistsCondition
// - resolveParentChain
// - toParentChainCondition
//
// READ PLANNING
// - toUserSearchQueryPlan
// - toUserRelationsWithContributionConstraints
// - toUserReadQueryPlan
//
// QUERY CONTEXT
// - getUserQueryContext

/********************
 *  DB RELATIONS
 ************/
/**
 * Extended relation graph for user detail/admin endpoints.
 * Includes contribution and defaults state required for self/detail/admin profile shaping.
 */
export const userEntityWithRelations = {
  hubRoles: true,
  organisationRoles: true,
  projectRoles: true,
  userLayers: {
    with: {
      layer: {
        columns: {
          createdAt: false,
          modifiedAt: false,
        },
      },
    },
  },
  contributedFeatures: {
    columns: {
      id: true,
      isPublished: true,
    },
  },
  contributedImages: {
    columns: {
      id: true,
    },
    with: {
      featureImage: {
        columns: {
          isPublished: true,
        },
      },
    },
  },
  contributedTasks: {
    columns: {
      id: true,
      type: true,
    },
  },
}

type UserLookupParams = {
  ref: string
  refKey?: 'id' | 'username'
  meta?: { profile?: string } | undefined
}

/********************
 *  PROFILE SHAPING
 ************/

/**
 * Runtime guard for non-null object values.
 * Used to safely normalize contribution arrays loaded through optional relations.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Shapes a hydrated user entity into the requested hydration profile.
 *
 * @param userEntity - User entity or `null`.
 * @param profile - Hydration response profile.
 * @returns Hydration-shaped user payload or `null`.
 */
export const toEntityResponseShape = <P extends UserHydrationProfile = 'attribution'>(
  userEntity:
    | Pick<UserDB, 'id' | 'attribution' | 'name' | 'image' | 'username'>
    | null
    | undefined,
  profile: P = 'attribution' as P,
): UserHydrationEntityByProfile<P> | null => {
  if (!userEntity) return null

  if (profile === 'card') {
    return UserHydrationCardProfileAPI.parse(
      userEntity,
    ) as UserHydrationEntityByProfile<P>
  }

  return UserHydrationAttributionProfileAPI.parse(
    userEntity,
  ) as UserHydrationEntityByProfile<P>
}

/**
 * Shapes a user row into a profile-specific API payload.
 *
 * @param user - Raw user row or `null`.
 * @param profile - Target user profile.
 * @returns Profile-shaped user payload or `null`.
 */
export const toUserProfileResponseShape = <P extends UserProfileType>(
  user: UserRaw | null | undefined,
  profile: P,
): UserEntityByProfile<P> | null => {
  if (!user) return null
  const data = toProfileData(user) as Record<UserProfileType, UserEntityByProfile<P>>
  return data[profile]
}

/**
 * Parses user-feature list rows into API-safe profile payloads.
 *
 * @param rows - Persisted list-state rows.
 * @returns Schema-validated list payloads.
 */
export const toUserFeatureListResponseShape = (
  rows: Array<{
    userId: string
    featureId: string
    isVisited: boolean
    isWishlisted: boolean
    visitedAt: string | null
    createdAt: string
    modifiedAt: string
  }>,
): Array<z.infer<typeof UserFeatureListProfileAPI>> =>
  rows.map(row => UserFeatureListProfileAPI.parse(row))

/**
 * Groups contribution ids by project id while excluding explicitly unpublished rows.
 * Keeps detail/admin profile payloads compact while preserving project-level grouping.
 */
const toGroupedContributionIds = (
  rows: Array<{ id: string; projectId?: string | null; isPublished?: boolean | null }>,
): Record<string, string[]> => {
  const grouped: Record<string, string[]> = {}
  rows
    .filter(row => row.isPublished !== false && row.projectId)
    .forEach(row => {
      const projectId = row.projectId as string
      if (!grouped[projectId]) grouped[projectId] = []
      grouped[projectId].push(row.id)
    })
  return grouped
}

/**
 * Builds contribution counters and grouped ids used by detail/admin user profiles.
 * Normalizes mixed relation payloads into one stable summary object.
 */
const toUserContributionSummary = (user: UserRaw) => {
  const source = user as unknown as Record<string, unknown>
  const contributedFeatures = Array.isArray(source.contributedFeatures)
    ? source.contributedFeatures
    : []
  const contributedImages = Array.isArray(source.contributedImages)
    ? source.contributedImages
    : []
  const contributedTasks = Array.isArray(source.contributedTasks)
    ? source.contributedTasks
    : []

  const featureRows = contributedFeatures
    .filter(isRecord)
    .map(feature => ({
      id: String(feature.id ?? ''),
      projectId:
        typeof feature.projectId === 'string'
          ? feature.projectId
          : (null as string | null),
      isPublished:
        typeof feature.isPublished === 'boolean'
          ? feature.isPublished
          : (null as boolean | null),
    }))
    .filter(feature => feature.id.length > 0)

  const imageRows = contributedImages
    .filter(isRecord)
    .map(image => {
      const featureImage = isRecord(image.featureImage) ? image.featureImage : null
      const feature =
        featureImage && isRecord(featureImage.feature) ? featureImage.feature : null
      return {
        id: String(image.id ?? ''),
        projectId:
          feature && typeof feature.projectId === 'string' ? feature.projectId : null,
        isPublished:
          featureImage && typeof featureImage.isPublished === 'boolean'
            ? featureImage.isPublished
            : null,
      }
    })
    .filter(image => image.id.length > 0 && image.projectId)

  const reportedMissingCount = contributedTasks
    .filter(isRecord)
    .filter(task => task.type === 'reportedMissing').length
  const newPhotoCount = contributedTasks
    .filter(isRecord)
    .filter(task => task.type === 'newPhoto').length
  const newFeatureCount = contributedTasks
    .filter(isRecord)
    .filter(task => task.type === 'newFeature').length

  return {
    contributedFeatures: toGroupedContributionIds(featureRows),
    contributedImages: toGroupedContributionIds(imageRows),
    reportedMissingCount,
    newPhotoCount,
    newFeatureCount,
  }
}

/**
 * Normalizes attached role rows into `UserRoleDisco` items with explicit entity type.
 * This avoids leaking relation-specific row shapes into profile payload generation.
 */
const toRoleSummary = (user: UserRaw): UserRoleDisco[] => {
  const source = user as unknown as Record<string, unknown>
  const mapRoles = (rows: unknown, type: UserRoleDisco['type']): UserRoleDisco[] =>
    Array.isArray(rows)
      ? rows
          .filter(isRecord)
          .map(role => ({ ...role, type }) as unknown as UserRoleDisco)
      : []

  return [
    ...mapRoles(source.hubRoles, 'hub'),
    ...mapRoles(source.organisationRoles, 'organisation'),
    ...mapRoles(source.projectRoles, 'project'),
  ]
}

/********************
 *  PROFILE ASSEMBLY
 ************/
/**
 * Builds all user profile variants from one raw user row.
 * Consumers select the required variant via `toUserProfileResponseShape`.
 */
const toProfileData = (
  user: UserRaw,
): {
  attribution: z.infer<typeof UserAttributionProfileAPI>
  adminList: z.infer<typeof UserAdminListProfileAPI>
  card: z.infer<typeof UserCardProfileAPI>
  leaderboard: z.infer<typeof UserLeaderboardProfileAPI>
  detail: z.infer<typeof UserDetailProfileAPI>
  self: z.infer<typeof UserSelfProfileAPI>
  admin: z.infer<typeof UserAdminProfileAPI>
} => {
  const contributionSummary = toUserContributionSummary(user)
  const baseAttribution = {
    id: user.id,
    username: user.username,
    attribution: user.attribution,
  }
  const adminList = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    image: user.image,
  }
  const card = {
    id: user.id,
    username: user.username,
    image: user.image,
    attribution: user.attribution,
  }
  const leaderboard = {
    id: user.id,
    username: user.username,
    reportedMissingCount: contributionSummary.reportedMissingCount,
    newPhotoCount: contributionSummary.newPhotoCount,
    newFeatureCount: contributionSummary.newFeatureCount,
  }
  const detail = {
    ...card,
    ...contributionSummary,
  }
  const self = {
    id: user.id,
    name: user.name,
    username: user.username,
    image: user.image,
    attribution: user.attribution,
    locale: user.locale,
    preferences: user.preferences,
    experimental: user.experimental,
    isAnonymous: user.isAnonymous,
  }
  const admin = {
    ...adminList,
    attribution: user.attribution,
    locale: user.locale,
    preferences: user.preferences,
    experimental: user.experimental,
    isAnonymous: user.isAnonymous,
    ...contributionSummary,
    roles: toRoleSummary(user),
    createdAt: user.createdAt,
    modifiedAt: user.updatedAt,
  }

  return {
    attribution: UserAttributionProfileAPI.parse(baseAttribution),
    adminList: UserAdminListProfileAPI.parse(adminList),
    card: UserCardProfileAPI.parse(card),
    leaderboard: UserLeaderboardProfileAPI.parse(leaderboard),
    detail: UserDetailProfileAPI.parse(detail),
    self: UserSelfProfileAPI.parse(self),
    admin: UserAdminProfileAPI.parse(admin),
  }
}

/********************
 *  LOOKUP + SEARCH STATE
 ************/
/**
 * Reports whether user search requested privileged archived visibility.
 * Explicit `true` and tri-state `null` both require elevated access.
 */
export const isPrivilegedArchivedSearchRequested = (state: {
  isArchived: boolean | null
}): boolean => state.isArchived === true || state.isArchived === null

/**
 * Resolves the requested archived-state filter for user search.
 * Defaults to active-only (`false`) when omitted.
 *
 * @param conditions - Raw query condition payload.
 * @returns Normalized archived-state selector.
 */
export const toRequestedSearchState = (conditions: { isArchived?: unknown }) => {
  // Resolve tri-state archived filter from incoming query conditions.
  const isArchived = toTriStateBoolean(conditions.isArchived)
  return {
    // Default user search to active (non-archived) records.
    isArchived: isArchived === undefined ? false : isArchived,
  }
}

/**
 * Produces the lookup predicate used by guarded user entity reads.
 * Supports explicit username lookup and a fallback `id OR username` match.
 */
export const toUserLookupCondition = (params: UserLookupParams): SQL<unknown> =>
  params.refKey === 'username'
    ? eq(user.username, params.ref)
    : (or(eq(user.id, params.ref), eq(user.username, params.ref)) ??
      eq(user.id, params.ref))

/**
 * Resolves the effective response profile for guarded `getUser` callers.
 * Defaults to `self` for current-user lookups and `detail` for other reads.
 */
export const resolveUserProfile = (
  params: UserLookupParams,
  sessionUser: { id: string; username?: string | null },
):
  | 'attribution'
  | 'adminList'
  | 'card'
  | 'leaderboard'
  | 'detail'
  | 'self'
  | 'admin' => {
  if (params.meta?.profile) {
    return params.meta.profile as
      | 'attribution'
      | 'adminList'
      | 'card'
      | 'leaderboard'
      | 'detail'
      | 'self'
      | 'admin'
  }

  const isSelf =
    (params.refKey === 'username' && params.ref === sessionUser.username) ||
    params.ref === sessionUser.id

  return isSelf ? 'self' : 'detail'
}

/********************
 *  ROLE FILTERS
 ************/
/**
 * Resolves bounded pagination and constrained sorting options for user search.
 * Keeps search handlers from duplicating paging defaults and sort allow-lists.
 *
 * @param params - Raw pagination/sorting inputs from caller.
 * @returns Sanitized paging and sorting values.
 */
export const toUserSearchPagingAndSorting = (params: {
  pagination?: { limit?: number; offset?: number } | null
  sorting?: { sortBy?: string; sortOrder?: string } | null
}): {
  limit: number
  offset: number
  sortBy: 'name' | 'email' | 'createdAt' | 'updatedAt'
  sortOrder: 'asc' | 'desc'
} => {
  const limit = Math.min(params.pagination?.limit ?? 20, 100)
  const offset = params.pagination?.offset ?? 0
  const sortBy = params.sorting?.sortBy ?? 'name'
  const sortOrder = params.sorting?.sortOrder ?? 'asc'

  const resolvedSortBy =
    sortBy === 'email' || sortBy === 'createdAt' || sortBy === 'updatedAt'
      ? sortBy
      : 'name'
  const resolvedSortOrder = sortOrder === 'desc' ? 'desc' : 'asc'

  return {
    limit,
    offset,
    sortBy: resolvedSortBy,
    sortOrder: resolvedSortOrder,
  }
}

/**
 * Resolves role-level filter predicates for one role column.
 * Used by entity and parent-chain membership builders so selector semantics remain shared.
 */
const toRoleConditions = (
  roleColumn: AnyColumn,
  filter: { role?: string; roles?: string[]; anyRole?: boolean },
): SQL<unknown>[] => {
  // Resolve role predicates; `anyRole` disables role-level filtering.
  if (filter.anyRole) return []
  if (filter.role) return [eq(roleColumn, filter.role)]
  if ((filter.roles?.length ?? 0) > 0) {
    return [inArray(roleColumn, filter.roles as [string, ...string[]])]
  }
  return []
}

/**
 * Produces an entity-scoped `EXISTS` condition for user-role membership filters.
 *
 * @param db - Database handle.
 * @param filter - Role scope and role constraints.
 * @returns SQL `EXISTS` condition for the requested entity scope.
 */
export const toEntityRoleExistsCondition = (
  db: Database,
  filter: UserRoleFilter,
): SQL<unknown> => {
  // Resolve role-exists predicate scoped to the requested entity type.
  switch (filter.entityType) {
    case 'hub': {
      const roleConditions = toRoleConditions(hubRole.role, filter)
      return exists(
        db
          .select({ userId: hubRole.userId })
          .from(hubRole)
          .where(
            and(
              eq(hubRole.userId, user.id),
              eq(hubRole.hubId, filter.entityId),
              ...roleConditions,
            ),
          ),
      )
    }

    case 'organisation': {
      const roleConditions = toRoleConditions(organisationRole.role, filter)
      return exists(
        db
          .select({ userId: organisationRole.userId })
          .from(organisationRole)
          .where(
            and(
              eq(organisationRole.userId, user.id),
              eq(organisationRole.organisationId, filter.entityId),
              ...roleConditions,
            ),
          ),
      )
    }

    case 'project': {
      const roleConditions = toRoleConditions(projectRole.role, filter)
      return exists(
        db
          .select({ userId: projectRole.userId })
          .from(projectRole)
          .where(
            and(
              eq(projectRole.userId, user.id),
              eq(projectRole.projectId, filter.entityId),
              ...roleConditions,
            ),
          ),
      )
    }
  }
}

/**
 * Resolves the parent role chain for role-up-parent-chain filters.
 * Projects expand to organisation plus optional hub; organisations expand to optional hub.
 *
 * @param db - Database handle.
 * @param filter - Parent-chain source entity descriptor.
 * @returns Ordered parent entity chain used to compose membership checks.
 */
const resolveParentChain = async (
  db: Database,
  filter: UserParentChainRoleFilter,
): Promise<Array<{ entityType: UserRoleEntityType; entityId: string }>> => {
  // Resolve parent role chain for organisation -> hub.
  if (filter.fromEntityType === 'organisation') {
    const [organisationRecord] = await db
      .select({ hubId: organisation.hubId })
      .from(organisation)
      .where(eq(organisation.id, filter.fromEntityId))
      .limit(1)

    if (!organisationRecord?.hubId) return []

    return [{ entityType: 'hub', entityId: organisationRecord.hubId }]
  }

  // Resolve parent role chain for project -> organisation -> hub.
  const [projectRecord] = await db
    .select({ organisationId: project.organisationId })
    .from(project)
    .where(eq(project.id, filter.fromEntityId))
    .limit(1)

  if (!projectRecord?.organisationId) return []

  const [organisationRecord] = await db
    .select({ hubId: organisation.hubId })
    .from(organisation)
    .where(eq(organisation.id, projectRecord.organisationId))
    .limit(1)

  const chain: Array<{ entityType: UserRoleEntityType; entityId: string }> = [
    { entityType: 'organisation', entityId: projectRecord.organisationId },
  ]

  if (organisationRecord?.hubId) {
    chain.push({ entityType: 'hub', entityId: organisationRecord.hubId })
  }

  return chain
}

/**
 * Produces a role filter condition across parent entities (organisation/hub chain).
 *
 * @param db - Database handle.
 * @param filter - Parent-chain role filter settings.
 * @returns OR-composed SQL condition, or never-match fallback.
 */
export const toParentChainCondition = async (
  db: Database,
  filter: UserParentChainRoleFilter,
): Promise<SQL<unknown>> => {
  // Resolve candidate parent entities for this filter.
  const parentEntities = await resolveParentChain(db, filter)
  if (parentEntities.length === 0) return sql`0 = 1`

  // Resolve OR-ed role-exists predicates across the parent chain.
  const roleConditions = parentEntities.map(parentEntity =>
    toEntityRoleExistsCondition(db, {
      entityType: parentEntity.entityType,
      entityId: parentEntity.entityId,
      role: filter.role,
      roles: filter.roles,
      anyRole: filter.anyRole,
    }),
  )

  // Return a never-match fallback when no role predicates are produced.
  return or(...roleConditions) ?? sql`0 = 1`
}

/********************
 *  READ PLANNING
 ************/
/**
 * Resolves search conditions plus bounded paging/sorting for guarded user search.
 * Keeps remote handlers focused on authorization, DB invocation, and response shaping.
 */
export const toUserSearchQueryPlan = async (
  db: Database,
  params: UserSearchQueryParams,
): Promise<{
  requestedState: { isArchived: boolean | null }
  conditions: SQL<unknown>[]
  limit: number
  offset: number
  sortBy: 'name' | 'email' | 'createdAt' | 'updatedAt'
  sortOrder: 'asc' | 'desc'
}> => {
  const requestedState = toRequestedSearchState({
    isArchived: params.conditions?.isArchived,
  })

  const conditions: SQL<unknown>[] = []
  if (requestedState.isArchived !== null) {
    conditions.push(eq(user.isArchived, requestedState.isArchived))
  }

  const q = params.q?.trim()
  if (q) {
    conditions.push(toSearchCondition(q))
  }

  if (params.roleOnEntity) {
    conditions.push(toEntityRoleExistsCondition(db, params.roleOnEntity))
  }

  if (params.roleUpParentChain) {
    conditions.push(await toParentChainCondition(db, params.roleUpParentChain))
  }

  return {
    requestedState,
    conditions,
    ...toUserSearchPagingAndSorting(params),
  }
}

/**
 * Extends the base user relation graph with contribution filters derived from prisms and hub scope.
 * Used by guarded `getUser` so contribution summaries only include currently visible resources.
 */
export const toUserRelationsWithContributionConstraints = (
  db: Database,
  params: {
    prisms?: Prisms | null
    hubOpts?: Partial<HubOptsExtended> | null
    sessionUser: SessionUser
    isAdminRequest: boolean
  },
) => {
  const featureConstraints: SQL<unknown>[] = []

  if (
    params.prisms &&
    (params.prisms.organisation.length > 0 ||
      params.prisms.project.length > 0 ||
      params.prisms.layer.length > 0)
  ) {
    featureConstraints.push(
      ...applyPrismConstraints(db, HierarchicalResource.feature, params.prisms),
    )
  }

  const hubOpts = params.hubOpts ?? { isCore: true }
  const shouldApplyHubFilter = !params.sessionUser.superAdmin || !params.isAdminRequest

  if (shouldApplyHubFilter) {
    const isCore = hubOpts.isCore ?? true
    const scopedOrganisationsRaw = (hubOpts as { organisations?: unknown })
      .organisations
    const scopedOrganisations = Array.isArray(scopedOrganisationsRaw)
      ? scopedOrganisationsRaw.filter(
          (
            organisationRow,
          ): organisationRow is {
            id: string
            isHubExclusive?: boolean
          } =>
            Boolean(organisationRow) &&
            typeof organisationRow === 'object' &&
            typeof (organisationRow as { id?: unknown }).id === 'string',
        )
      : []

    if (scopedOrganisations.length > 0) {
      const organisationIds = isCore
        ? scopedOrganisations
            .filter(organisationRow => !organisationRow.isHubExclusive)
            .map(organisationRow => organisationRow.id)
        : scopedOrganisations.map(organisationRow => organisationRow.id)

      if (organisationIds.length > 0) {
        featureConstraints.push(inArray(feature.organisationId, organisationIds))
      }
    } else {
      const featureHubFilter = getFeatureHubFilter(db, {
        ...hubOpts,
        isCore,
        isAdminRequest: params.isAdminRequest,
        isSuperAdmin: Boolean(params.sessionUser.superAdmin && params.isAdminRequest),
        ...('code' in hubOpts && hubOpts.code ? { code: hubOpts.code } : {}),
        ...('domain' in hubOpts && hubOpts.domain ? { domain: hubOpts.domain } : {}),
      } as HubOptsExtended)
      if (featureHubFilter) featureConstraints.push(featureHubFilter)
    }
  }

  if (featureConstraints.length === 0) {
    return userEntityWithRelations
  }

  const constrainedFeatureIds = db
    .select({ id: feature.id })
    .from(feature)
    .where(and(...featureConstraints))

  return {
    ...userEntityWithRelations,
    contributedFeatures: {
      columns: {
        id: true,
        isPublished: true,
        projectId: true,
      },
      where: inArray(feature.id, constrainedFeatureIds),
    },
    contributedImages: {
      columns: {
        id: true,
      },
      with: {
        featureImage: {
          columns: {
            isPublished: true,
            featureId: true,
          },
          with: {
            feature: {
              columns: {
                projectId: true,
              },
            },
          },
          where: inArray(featureImage.featureId, constrainedFeatureIds),
        },
      },
    },
  }
}

/********************
 *  READ PLANNING
 ************/
/**
 * Builds lookup conditions, scoped relations, and profile selection for guarded user reads.
 * Keeps remote handlers orchestration-only while preserving request-aware contribution scoping.
 */
export const toUserReadQueryPlan = (
  db: Database,
  params: {
    lookup: UserLookupParams
    sessionUser: SessionUser
    userRoles: UserRoleDisco[]
    request: Request
    prisms?: Prisms | null
    hubOpts?: Partial<HubOptsExtended> | null
    isAdminRequest: boolean
  },
): {
  conditions: SQL<unknown>[]
  profile:
    | 'attribution'
    | 'adminList'
    | 'card'
    | 'leaderboard'
    | 'detail'
    | 'self'
    | 'admin'
  withRelations: Record<string, boolean | object>
} => {
  const { conditions } = getUserQueryContext(
    params.sessionUser,
    params.request,
    {},
    params.userRoles,
    false,
  )
  conditions.push(toUserLookupCondition(params.lookup))

  return {
    conditions,
    profile: resolveUserProfile(params.lookup, params.sessionUser),
    withRelations: toUserRelationsWithContributionConstraints(db, {
      prisms: params.prisms,
      hubOpts: params.hubOpts,
      sessionUser: params.sessionUser,
      isAdminRequest: params.isAdminRequest,
    }),
  }
}

/********************
 *  QUERY CONTEXT
 ************/
/**
 * Builds final user query conditions for list and entity reads.
 * Non-super-admin callers are restricted from seeing archived users, and most callers are scoped to self-only visibility.
 *
 * @param currentUser - Current session user.
 * @param request - Request object used to distinguish admin from public flows.
 * @param params - Raw query parameters.
 * @param userRoles - Resolved role disco rows for the current user.
 * @param isCollection - Whether the query targets a collection rather than a single entity.
 * @returns Normalized params, SQL conditions, and excluded-column metadata.
 */
export const getUserQueryContext = (
  currentUser: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  isCollection: boolean = true,
) => {
  // SETUP : By default, exclude isArchived filters from the query, so
  // users cannot see disabled users
  let conditions: SQL<unknown>[] = []
  const excludeColumns = ['isArchived']

  // NON-SUPERADMIN : Hide users which are archived
  if (!isSuperAdmin(currentUser)) {
    conditions.push(eq(user.isArchived, false))
  }

  // If a specific user is being looked up, we don't need to apply any filters
  if (!isCollection) {
    return { params, conditions, excludeColumns }
  }

  // Helper function to check if user has organisation owner role
  const hasOrganisationOwnerRole = (userRoles: UserRoleDisco[]) => {
    return userRoles.some(role => role.type === 'organisation' && role.role === 'owner')
  }

  // Helper function to check if user has project maintainer role
  const hasProjectMaintainerRole = (userRoles: UserRoleDisco[]) => {
    return userRoles.some(role => role.type === 'project' && role.role === 'maintainer')
  }

  // PUBLIC : public requests can only see their own user
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns)
    // Other roles can only see their own user
    conditions.push(eq(user.id, currentUser.id))

    // ADMIN : Check user roles to determine access level
  } else if (!isSuperAdmin(currentUser)) {
    params = removeExcludedColumns(params, excludeColumns)

    // Check if user has organisation owner or project maintainer role
    // ENHANCEMENT : Organisation owners should see all users as we have now, but Project Maintainers should only be able to see members of the organisation.
    const canSeeAllUsers =
      hasOrganisationOwnerRole(userRoles) || hasProjectMaintainerRole(userRoles)

    if (canSeeAllUsers) {
      // Organisation owners and project maintainers can see all users
      // No additional conditions needed
    } else {
      // Other roles can only see their own user
      conditions.push(eq(user.id, currentUser.id))
    }

    // SUPERADMIN : Can see all users regardless of any filters
  } else {
    // No conditions for superadmin, as they can see all users
    conditions = []
  }

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(params).length > 0) {
    applyQueryFilters(user, params, conditions)
  }

  return { params, conditions, excludeColumns }
}
