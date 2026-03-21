// SVELTE
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
import { eq } from 'drizzle-orm'
// API
import { getPrisms } from '$lib/api'
import {
  guardedBatchByIdQuery,
  guardedCommand,
  guardedQuery,
} from '$lib/api/server/remote'
import {
  isPrivilegedArchivedSearchRequested,
  toEntityResponseShape,
  toUserReadQueryPlan,
  toUserFeatureListResponseShape,
  toUserProfileResponseShape,
  toUserSearchQueryPlan,
  userEntityWithRelations,
} from '$lib/api/services/user'
import {
  canOverrideUserSearchArchivedFilter,
  canSearchUsers,
  canUpdateUserProfile,
  toAuthMessage,
} from '$lib/api/services/authz'
// DB
import { user } from '$lib/db/schema/index'
import {
  getUser as loadUser,
  getUserFeaturesByUserId,
  getUserLayersByUserId,
  getUsersForHydration,
  removeUserFeatureListState,
  searchUsersByConditions,
  updateUser,
  updateUserLayers,
  upsertUserFeatureState,
} from '$lib/db/services/user'
// UTILS
import { normalizeUsername, validateUsername } from '$lib/utils/username'
// TYPES
import type { Id } from '$lib/types'
import type { UserHydrationResult, UserRaw } from '$lib/db/zod/schema/user.types'

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
 * Returns a role-filtered admin user search result for guarded remote callers.
 *
 * @param params - Search params validated by `UserSearchQueryParamsSchema`.
 * @param params.q - Optional free-text user search query.
 * @param params.conditions - Optional list-state filters, including archived visibility.
 * @param params.roleOnEntity - Optional direct role filter scoped to one entity.
 * @param params.roleUpParentChain - Optional inherited role filter resolved up the parent chain.
 * @param params.pagination - Optional paging controls (`limit`, `offset`).
 * @param params.sorting - Optional sort config for admin search results.
 * @param params.meta - Optional request metadata.
 * @param params.meta.isAdminRequest - Explicit admin-origin hint used by guarded context resolution.
 * @returns A promise resolving to paged admin-list user results plus total-count metadata.
 * @remarks
 * Uses guarded query context so request-scoped auth/session state is resolved once and
 * `meta.isAdminRequest` semantics stay aligned with the rest of the remote layer.
 * Archived-user search is additionally protected behind a privileged policy gate.
 */
export const searchUsers = guardedQuery(
  UserSearchQueryParamsSchema,
  async (params, ctx) => {
    const { db, user, userRoles } = ctx

    // Apply role-based authorization.
    if (!canSearchUsers({ superAdmin: user.superAdmin, userRoles })) {
      throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    }

    const queryPlan = await toUserSearchQueryPlan(db, params)

    // Guard privileged archived filter usage.
    if (
      isPrivilegedArchivedSearchRequested(queryPlan.requestedState) &&
      !canOverrideUserSearchArchivedFilter({
        superAdmin: user.superAdmin,
        userRoles,
      })
    ) {
      throw error(403, toAuthMessage('FIELD_FORBIDDEN'))
    }

    // Load paged records from DB.
    const result = await searchUsersByConditions(db, {
      conditions: queryPlan.conditions,
      limit: queryPlan.limit,
      offset: queryPlan.offset,
      sortBy: queryPlan.sortBy,
      sortOrder: queryPlan.sortOrder,
    })

    // Return loaded records and list metadata.
    return {
      data: result.data.map(row => UserAdminListProfileAPI.parse(row)),
      limit: queryPlan.limit,
      offset: queryPlan.offset,
      totalCount: result.totalCount,
    }
  },
)

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

/**
 * Returns a role-aware user record for guarded remote callers.
 *
 * @param params - Lookup params validated by `GetUserParamsSchema`.
 * @param params.ref - User identifier or username value.
 * @param params.refKey - Optional lookup column (`id` or `username`).
 * @param params.meta - Optional request metadata.
 * @param params.meta.isAdminRequest - Explicit admin-origin hint used by guarded context resolution.
 * @param params.meta.profile - Optional response profile override.
 * @returns A promise resolving to `{ data }`, where `data` is the matched user or `null`.
 * @remarks
 * Builds the read scope from the guarded session context, current hub, and active prisms
 * before loading the richer user relation graph required for contribution summaries.
 */
export const getUser = guardedQuery(GetUserParamsSchema, async (params, ctx) => {
  const { db, user: sessionUser, userRoles, event } = ctx
  if (!sessionUser) {
    throw error(401, 'AUTH_REQUIRED')
  }

  const queryPlan = toUserReadQueryPlan(db, {
    lookup: params,
    sessionUser,
    userRoles,
    request: event.request,
    prisms: getPrisms(event.url),
    hubOpts: event.locals.hub,
    isAdminRequest: ctx.isAdminRequest,
  })

  const result = (await loadUser(
    db,
    queryPlan.withRelations,
    queryPlan.conditions,
  )) as UserRaw
  if (!result) return { data: null }

  return {
    data: toUserProfileResponseShape(result, queryPlan.profile),
  }
})

/**
 * Updates a user's editable profile fields for self-service or super-admin callers.
 *
 * @param params - Command payload validated by `UpdateUserParamsSchema`.
 * @param params.id - User id to update.
 * @param params.data - Partial user fields to persist.
 * @returns A promise resolving to the refreshed `self` profile payload.
 * @remarks
 * Reloads the persisted user after mutation so the response reflects current relation shaping
 * and normalized username rules rather than echoing the submitted payload directly.
 */
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

    if (
      !canUpdateUserProfile(
        {
          isAuthenticated: true,
          userId: sessionUser.id,
          superAdmin: sessionUser.superAdmin,
        },
        params.id,
      )
    ) {
      throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
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

/**
 * Returns the saved default layer-visibility rows for the resolved target user.
 *
 * @param params - Query params validated by `GetUserLayersParamsSchema`.
 * @param params.userId - Optional target user id; omitted means current session user.
 * @returns A promise resolving to `{ data }`, where `data` contains the user's layer defaults.
 * @remarks
 * Non-super-admin callers are restricted to their own user id via `resolveTargetUserId`.
 */
export const getUserLayers = guardedQuery(
  GetUserLayersParamsSchema,
  async (params, ctx) => {
    const { db, user: sessionUser } = ctx
    if (!sessionUser) {
      throw error(401, 'AUTH_REQUIRED')
    }

    const targetUserId = resolveTargetUserId(sessionUser, params.userId)
    const rows = await getUserLayersByUserId(
      db,
      targetUserId,
      params.hubId as Id | undefined,
    )
    return { data: rows }
  },
)

/**
 * Replaces the saved default layer-visibility rows for the resolved target user.
 *
 * @param params - Command payload validated by `SetUserLayerDefaultsSchema`.
 * @param params.userId - Optional target user id; omitted means current session user.
 * @param params.layers - Desired layer visibility defaults to persist.
 * @returns A promise resolving to `{ data }`, where `data` contains the updated layer defaults.
 * @remarks
 * The payload is normalized to the resolved target user id before persistence so callers
 * cannot spoof ownership of layer preference rows.
 */
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
      hubId: params.hubId,
      layerId: layer.layerId,
      isDefaultVisible: Boolean(layer.isDefaultVisible),
    }))

    const updated = await updateUserLayers(db, rows, targetUserId, params.hubId as Id)
    return { data: updated }
  },
)

/**
 * Returns paged saved user-feature list rows for the resolved target user.
 *
 * @param params - Query params validated by `GetUserFeaturesParamsSchema`.
 * @param params.userId - Optional target user id; omitted means current session user.
 * @param params.conditions - Optional list-state filters passed to the DB service.
 * @param params.pagination - Optional paging controls (`limit`, `offset`).
 * @param params.sorting - Optional sort config for feature list rows.
 * @returns A promise resolving to a paged feature-list response envelope.
 * @remarks
 * The response preserves list metadata (`totalCount`, `hasMore`, `nextOffset`, sorting)
 * so admin and self-service list UIs can consume this remote directly.
 */
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

/**
 * Adds or updates a user's wishlist/visited state for a feature.
 *
 * @param params - Command payload validated by `AddUserFeatureToListSchema`.
 * @param params.userId - Optional target user id; omitted means current session user.
 * @param params.featureId - Feature id to update list state for.
 * @param params.list - Target list kind (`wishlist` or `visited`).
 * @param params.visitedAt - Optional explicit visited timestamp for visited-list writes.
 * @returns A promise resolving to `{ data }`, where `data` is the normalized updated row.
 * @remarks
 * Uses the same upsert path for both wishlist and visited state so the user-feature row stays
 * canonical regardless of which list action was triggered first.
 */
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

/**
 * Removes one saved user-feature list state from the resolved target user.
 *
 * @param params - Command payload validated by `RemoveUserFeatureFromListSchema`.
 * @param params.userId - Optional target user id; omitted means current session user.
 * @param params.featureId - Feature id to update list state for.
 * @param params.list - Target list kind (`wishlist` or `visited`) to clear.
 * @returns A promise resolving to `{ data }`, where `data` is the remaining normalized row or `null`.
 * @remarks
 * Returns `null` when clearing the requested list leaves no remaining saved state for that
 * feature/user pair, which keeps the client cache aligned with deletion semantics.
 */
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
