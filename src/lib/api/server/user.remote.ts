// SVELTE
import { getRequestEvent, query } from '$app/server'
import { error } from '@sveltejs/kit'
// ZOD
import {
  AddUserFeatureToListSchema,
  GetUserFeaturesParamsSchema,
  GetUserLayersParamsSchema,
  GetUserParamsSchema,
  RemoveUserFeatureFromListSchema,
  SetUserLayerDefaultsSchema,
  UpdateUserParamsSchema,
  UserAdminListProfileAPI,
  UserHydrationSchema,
  UserSearchQueryParamsSchema,
} from '$lib/db/zod'
// DRIZZLE
import { and, eq, inArray, or, type SQL } from 'drizzle-orm'
// API
import { getPrisms, setupRequestHandler } from '$lib/api'
import {
  guardedBatchByIdQuery,
  guardedCommand,
  guardedQuery,
} from '$lib/api/server/remote'
import {
  assertPermissionsToUpdateUser,
  getUserQueryContext,
  isPrivilegedArchivedSearchRequested,
  toEntityRoleExistsCondition,
  toEntityResponseShape,
  toParentChainCondition,
  toRequestedSearchState,
  toUserFeatureListResponseShape,
  toUserProfileResponseShape,
  toUserSearchPagingAndSorting,
  userEntityWithRelations,
} from '$lib/api/services/user'
import {
  canOverrideUserSearchArchivedFilter,
  canSearchUsers,
  toAuthMessage,
} from '$lib/api/services/authz'
// DB
import { applyPrismConstraints } from '$lib/db'
import { feature, featureImage, user, user as userTable } from '$lib/db/schema/index'
import { getFeatureHubFilter } from '$lib/db/services/hub'
import {
  getUser as loadUser,
  getUserFeaturesByUserId,
  getUserLayersByUserId,
  getUsersForHydration,
  removeUserFeatureListState,
  searchUsersByConditions,
  toSearchCondition,
  updateUser,
  updateUserLayers,
  upsertUserFeatureState,
} from '$lib/db/services/user'
import { HierarchicalResource } from '$lib/enums'
// UTILS
import { normalizeUsername, validateUsername } from '$lib/utils/username'
// TYPES
import type {
  Id,
  UserHydrationResult,
  UserParentChainRoleFilter,
  UserRoleFilter,
  UserRaw,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - searchUsers
// - getUserForAttribution
// - getUser
// - getUserLayers
// - getUserFeatures
//
// FORM
// - none
//
// COMMAND
// - updateUserProfile
// - setUserLayerDefaults
// - addUserFeatureToList
// - removeUserFeatureFromList

/**
 * Resolves the target user id for self/super-admin operations.
 * Non-super-admin callers cannot target other users.
 */
const resolveTargetUserId = (
  sessionUser: { id: string; superAdmin?: boolean },
  requestedUserId?: string,
): Id => {
  const targetUserId = (requestedUserId ?? sessionUser.id) as Id
  if (targetUserId !== sessionUser.id && !sessionUser.superAdmin) {
    throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
  }
  return targetUserId
}

/**
 * Resolves effective response profile for `getUser`.
 * Falls back to `self` for current-user lookups, otherwise `detail`.
 */
const resolveUserProfile = (
  params: {
    ref: string
    refKey?: 'id' | 'username'
    meta?: { profile?: string } | undefined
  },
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

export const searchUsers = query(UserSearchQueryParamsSchema, async params => {
  // Resolve request-scoped dependencies.
  const event = getRequestEvent()
  const { db, user, userRoles } = await setupRequestHandler(event)

  // Apply role-based authorization.
  if (!canSearchUsers({ superAdmin: user.superAdmin, userRoles })) {
    throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
  }

  // Resolve requested visibility state from query params.
  const requestedState = toRequestedSearchState({
    isArchived: params.conditions?.isArchived,
  })

  // Guard privileged archived filter usage.
  if (
    isPrivilegedArchivedSearchRequested(requestedState) &&
    !canOverrideUserSearchArchivedFilter({
      superAdmin: user.superAdmin,
      userRoles,
    })
  ) {
    throw error(403, toAuthMessage('FIELD_FORBIDDEN'))
  }

  // Resolve base SQL conditions.
  const conditions: SQL<unknown>[] = []
  if (requestedState.isArchived !== null) {
    conditions.push(eq(userTable.isArchived, requestedState.isArchived))
  }

  // Resolve text-search conditions.
  const q = params.q?.trim()
  if (q) {
    conditions.push(toSearchCondition(q))
  }

  // Resolve direct role-scope filter when provided.
  if (params.roleOnEntity) {
    conditions.push(
      toEntityRoleExistsCondition(db, params.roleOnEntity as UserRoleFilter),
    )
  }

  // Resolve parent-chain role-scope filter when provided.
  if (params.roleUpParentChain) {
    conditions.push(
      await toParentChainCondition(
        db,
        params.roleUpParentChain as UserParentChainRoleFilter,
      ),
    )
  }

  // Resolve pagination and sorting params.
  const { limit, offset, sortBy, sortOrder } = toUserSearchPagingAndSorting(params)

  // Load paged records from DB.
  const result = await searchUsersByConditions(db, {
    conditions,
    limit,
    offset,
    sortBy,
    sortOrder,
  })

  // Return loaded records and list metadata.
  return {
    data: result.data.map(row => UserAdminListProfileAPI.parse(row)),
    limit,
    offset,
    totalCount: result.totalCount,
  }
})

/**
 * USERS - LOOKUP
 */

/**
 * Batched user hydration for attribution UIs.
 *
 * `profile='privacy'` returns attribution-only payload.
 * `profile='admin'` additionally returns name/image.
 */
export const getUserForAttribution = guardedBatchByIdQuery<
  typeof UserHydrationSchema,
  UserHydrationResult
>(UserHydrationSchema, async ({ ids, ctx }) => {
  // Load requested user ids in a single batch query.
  const rows = await getUsersForHydration(ctx.db, ids as Id[])
  // Index non-archived rows for O(1) id lookups in the resolver closure.
  const byId = new Map(rows.filter(row => !row.isArchived).map(row => [row.id, row]))

  // Intentionally returns raw items (not envelope) because this is a high-frequency
  // batch hydrator used by attribution UI snippets. Envelope metadata would add
  // per-item overhead and extra unwrapping with no practical value here.
  return (arg): UserHydrationResult => {
    const row = byId.get(arg.id)
    if (!row) return null
    const profile = arg.meta?.profile ?? (ctx.isAdminRequest ? 'card' : 'attribution')
    return toEntityResponseShape(row, profile)
  }
})

export const getUser = guardedQuery(GetUserParamsSchema, async (params, ctx) => {
  const { db, user: sessionUser, userRoles, event } = ctx
  if (!sessionUser) {
    throw error(401, 'AUTH_REQUIRED')
  }

  const prisms = getPrisms(event.url)
  const { conditions } = getUserQueryContext(
    sessionUser,
    event.request,
    {},
    userRoles,
    false,
  )

  const userCondition =
    params.refKey === 'username'
      ? eq(user.username, params.ref)
      : or(eq(user.id, params.ref), eq(user.username, params.ref))
  if (userCondition) {
    conditions.push(userCondition)
  }

  const featureConstraints: SQL<unknown>[] = []
  if (
    prisms &&
    (prisms.organisation.length > 0 ||
      prisms.project.length > 0 ||
      prisms.layer.length > 0)
  ) {
    featureConstraints.push(
      ...applyPrismConstraints(db, HierarchicalResource.feature, prisms),
    )
  }

  const hubOpts = event.locals.hub || { isCore: true }
  const shouldApplyHubFilter = !sessionUser.superAdmin || !ctx.isAdminRequest

  if (shouldApplyHubFilter) {
    const isCore = 'isCore' in hubOpts ? hubOpts.isCore : true

    const scopedOrganisationsRaw = (hubOpts as { organisations?: unknown })
      .organisations
    const scopedOrganisations = Array.isArray(scopedOrganisationsRaw)
      ? scopedOrganisationsRaw.filter(
          (
            org,
          ): org is {
            id: string
            isHubExclusive?: boolean
          } =>
            Boolean(org) &&
            typeof org === 'object' &&
            typeof (org as { id?: unknown }).id === 'string',
        )
      : []

    if (scopedOrganisations.length > 0) {
      const organisationIds = isCore
        ? scopedOrganisations.filter(org => !org.isHubExclusive).map(org => org.id)
        : scopedOrganisations.map(org => org.id)
      if (organisationIds.length > 0) {
        featureConstraints.push(inArray(feature.organisationId, organisationIds))
      }
    } else {
      const featureHubFilter = getFeatureHubFilter(db, {
        ...hubOpts,
        isCore,
        isAdminRequest: ctx.isAdminRequest,
        isSuperAdmin: Boolean(sessionUser.superAdmin && ctx.isAdminRequest),
        ...('code' in hubOpts && hubOpts.code ? { code: hubOpts.code } : {}),
        ...('domain' in hubOpts && hubOpts.domain ? { domain: hubOpts.domain } : {}),
      })
      if (featureHubFilter) featureConstraints.push(featureHubFilter)
    }
  }

  const userRelationsWithPrisms = {
    ...userEntityWithRelations,
    contributedFeatures: {
      columns: {
        id: true,
        isPublished: true,
        projectId: true,
      },
      where:
        featureConstraints.length > 0
          ? inArray(
              feature.id,
              db
                .select({ id: feature.id })
                .from(feature)
                .where(and(...featureConstraints)),
            )
          : undefined,
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
          where:
            featureConstraints.length > 0
              ? inArray(
                  featureImage.featureId,
                  db
                    .select({ id: feature.id })
                    .from(feature)
                    .where(and(...featureConstraints)),
                )
              : undefined,
        },
      },
    },
  }

  const result = (await loadUser(db, userRelationsWithPrisms, conditions)) as UserRaw
  if (!result) return { data: null }

  const profile = resolveUserProfile(params, sessionUser)
  return {
    data: toUserProfileResponseShape(result, profile),
  }
})

export const updateUserProfile = guardedCommand(
  UpdateUserParamsSchema,
  async (params, ctx) => {
    const { db, user: sessionUser } = ctx
    if (!sessionUser) {
      throw error(401, 'AUTH_REQUIRED')
    }

    const existing = await loadUser(db, {}, [eq(user.id, params.id)])
    if (!existing) {
      throw error(404, 'USER_NOT_FOUND')
    }

    const assertionError = assertPermissionsToUpdateUser(
      sessionUser,
      existing,
      params.id as Id,
    )
    if (assertionError) {
      throw assertionError
    }

    const newData = { ...params.data }
    if (typeof newData.username === 'string') {
      const username = normalizeUsername(newData.username)
      if (!validateUsername(username)) {
        throw error(400, 'INVALID_USERNAME')
      }
      newData.username = username
    }

    await updateUser(db, newData, params.id as Id)

    const updatedWithRelations = (await loadUser(db, userEntityWithRelations, [
      eq(user.id, params.id),
    ])) as UserRaw | undefined

    if (!updatedWithRelations) {
      throw error(500, 'USER_UPDATE_RELOAD_FAILED')
    }

    return {
      data: toUserProfileResponseShape(updatedWithRelations, 'self' as const),
    }
  },
)

export const getUserLayers = guardedQuery(
  GetUserLayersParamsSchema,
  async (params, ctx) => {
    const { db, user: sessionUser } = ctx
    if (!sessionUser) {
      throw error(401, 'AUTH_REQUIRED')
    }

    const targetUserId = resolveTargetUserId(sessionUser, params.userId)
    const rows = await getUserLayersByUserId(db, targetUserId)
    return { data: rows }
  },
)

export const setUserLayerDefaults = guardedCommand(
  SetUserLayerDefaultsSchema,
  async (params, ctx) => {
    const { db, user: sessionUser } = ctx
    if (!sessionUser) {
      throw error(401, 'AUTH_REQUIRED')
    }

    const targetUserId = resolveTargetUserId(sessionUser, params.userId)
    const rows = params.layers.map(layer => ({
      userId: targetUserId,
      layerId: layer.layerId,
      isVisibleOnLoad: Boolean(layer.isVisibleOnLoad),
    }))

    const updated = await updateUserLayers(db, rows, targetUserId)
    return { data: updated }
  },
)

export const getUserFeatures = guardedQuery(
  GetUserFeaturesParamsSchema,
  async (params, ctx) => {
    const { db, user: sessionUser } = ctx
    if (!sessionUser) {
      throw error(401, 'AUTH_REQUIRED')
    }

    const targetUserId = resolveTargetUserId(sessionUser, params.userId)
    const result = await getUserFeaturesByUserId(db, {
      userId: targetUserId,
      conditions: params.conditions,
      pagination: params.pagination,
      sorting: params.sorting,
    })
    const limit = Math.min(params.pagination?.limit ?? 50, 100)
    const offset = params.pagination?.offset ?? 0

    return {
      data: toUserFeatureListResponseShape(result.data),
      limit,
      offset,
      totalCount: result.totalCount,
      hasMore: offset + result.data.length < result.totalCount,
      nextOffset:
        offset + result.data.length < result.totalCount
          ? offset + result.data.length
          : null,
      sortBy: params.sorting?.sortBy ?? 'modifiedAt',
      sortOrder: params.sorting?.sortOrder ?? 'desc',
    }
  },
)

export const addUserFeatureToList = guardedCommand(
  AddUserFeatureToListSchema,
  async (params, ctx) => {
    const { db, user: sessionUser } = ctx
    if (!sessionUser) {
      throw error(401, 'AUTH_REQUIRED')
    }

    const targetUserId = resolveTargetUserId(sessionUser, params.userId)
    const updated = await upsertUserFeatureState(db, {
      userId: targetUserId,
      featureId: params.featureId as Id,
      isWishlisted: params.list === 'wishlist' ? true : undefined,
      isVisited: params.list === 'visited' ? true : undefined,
      visitedAt:
        params.list === 'visited'
          ? (params.visitedAt ?? new Date().toISOString())
          : undefined,
    })

    return {
      data: toUserFeatureListResponseShape([updated])[0] ?? null,
    }
  },
)

export const removeUserFeatureFromList = guardedCommand(
  RemoveUserFeatureFromListSchema,
  async (params, ctx) => {
    const { db, user: sessionUser } = ctx
    if (!sessionUser) {
      throw error(401, 'AUTH_REQUIRED')
    }

    const targetUserId = resolveTargetUserId(sessionUser, params.userId)
    const updated = await removeUserFeatureListState(db, {
      userId: targetUserId,
      featureId: params.featureId as Id,
      list: params.list,
    })

    return {
      data: updated ? toUserFeatureListResponseShape([updated])[0] : null,
    }
  },
)
