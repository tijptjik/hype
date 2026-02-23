// SVELTE
import { getRequestEvent, query } from '$app/server'
import { error } from '@sveltejs/kit'
// ZOD
import { UserHydrationSchema, UserSearchQueryParamsSchema } from '$lib/db/zod'
// DRIZZLE
import { eq } from 'drizzle-orm'
// API
import { setupRequestHandler } from '$lib/api'
import { guardedBatchByIdQuery } from '$lib/api/server/remote'
import {
  isPrivilegedArchivedSearchRequested,
  toEntityRoleExistsCondition,
  toParentChainCondition,
  toUserSearchPagingAndSorting,
  toRequestedSearchState,
} from '$lib/api/services/user'
import {
  canOverrideUserSearchArchivedFilter,
  canSearchUsers,
  toAuthMessage,
} from '$lib/api/services/authz'
// DB
import { user as userTable } from '$lib/db/schema'
import {
  getUsersForHydration,
  searchUsersByConditions,
  toUserSearchTextCondition,
  toEntityResponseShape,
} from '$lib/db/services/user'
// TYPES
import type { SQL } from 'drizzle-orm'
import type {
  UserHydrationResult,
  UserParentChainRoleFilter,
  UserRoleFilter,
} from '$lib/types'

/**
 * USERS - LIST
 */

/**
 * Search users with optional role-based scope filters.
 *
 * @param params - Search, sorting, pagination, and role filter params.
 * @returns Matching users with list metadata.
 */
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
    conditions.push(toUserSearchTextCondition(q))
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
    data: result.data,
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
  const rows = await getUsersForHydration(ctx.db, ids)

  // Index non-archived rows for O(1) id lookups in the resolver closure.
  const byId = new Map(rows.filter(row => !row.isArchived).map(row => [row.id, row]))

  // Intentionally returns raw items (not envelope) because this is a high-frequency
  // batch hydrator used by attribution UI snippets. Envelope metadata would add
  // per-item overhead and extra unwrapping with no practical value here.
  return (arg): UserHydrationResult => {
    const row = byId.get(arg.id)
    if (!row) return null
    const profile = arg.meta?.profile ?? (ctx.isAdminRequest ? 'admin' : 'privacy')
    return toEntityResponseShape(row, profile)
  }
})
