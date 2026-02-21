// SVELTE
import { getRequestEvent, query } from '$app/server'
import { error } from '@sveltejs/kit'
// ZOD
import { UserHydrationSchema, UserSearchQueryParamsSchema } from '$lib/db/zod'
// DRIZZLE
import { and, asc, desc, eq, exists, inArray, like, or, sql } from 'drizzle-orm'
// API
import { setupRequestHandler } from '$lib/api'
import { guardedBatchByIdQuery } from '$lib/api/server/remote'
import { toTriStateBooleanOrUndefined } from '$lib/api/services'
import {
  canOverrideUserSearchArchivedFilter,
  canSearchUsers,
  toAuthMessage,
} from '$lib/api/services/authz'
// DB
import {
  user as userTable,
  hubRole,
  organisation,
  organisationRole,
  project,
  projectRole,
} from '$lib/db/schema'
import { getUsersForHydration, toEntityResponseShape } from '$lib/db/services/user'
// TYPES
import type { SQL, AnyColumn } from 'drizzle-orm'
import type {
  Database,
  UserHydrationResult,
  UserParentChainRoleFilter,
  UserRoleEntityType,
  UserRoleFilter,
} from '$lib/types'

const toRequestedSearchState = (conditions: { isArchived?: unknown }) => {
  const isArchived = toTriStateBooleanOrUndefined(conditions.isArchived)
  return {
    isArchived: isArchived === undefined ? false : isArchived,
  }
}

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
  const event = getRequestEvent()
  const { db, user, userRoles } = await setupRequestHandler(event)

  if (!canSearchUsers({ superAdmin: user.superAdmin, userRoles })) {
    throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
  }

  const requestedState = toRequestedSearchState({
    isArchived: params.conditions?.isArchived,
  })

  if (
    (requestedState.isArchived === true || requestedState.isArchived === null) &&
    !canOverrideUserSearchArchivedFilter({
      superAdmin: user.superAdmin,
      userRoles,
    })
  ) {
    throw error(403, toAuthMessage('FIELD_FORBIDDEN'))
  }

  const conditions: SQL<unknown>[] = []
  if (requestedState.isArchived !== null) {
    conditions.push(eq(userTable.isArchived, requestedState.isArchived))
  }

  const q = params.q?.trim()
  if (q) {
    const qLike = `%${q.toLowerCase()}%`
    conditions.push(
      or(
        like(sql`lower(${userTable.name})`, qLike),
        like(sql`lower(${userTable.username})`, qLike),
        like(sql`lower(${userTable.attribution})`, qLike),
        like(sql`lower(${userTable.email})`, qLike),
      ) ?? sql`1 = 0`,
    )
  }

  if (params.roleOnEntity) {
    conditions.push(
      toEntityRoleExistsCondition(db, params.roleOnEntity as UserRoleFilter),
    )
  }

  if (params.roleUpParentChain) {
    conditions.push(
      await toParentChainCondition(
        db,
        params.roleUpParentChain as UserParentChainRoleFilter,
      ),
    )
  }

  const limit = Math.min(params.pagination?.limit ?? 20, 100)
  const offset = params.pagination?.offset ?? 0
  const sortBy = params.sorting?.sortBy ?? 'name'
  const sortOrder = params.sorting?.sortOrder ?? 'asc'

  const sortColumns = {
    name: userTable.name,
    email: userTable.email,
    createdAt: userTable.createdAt,
    updatedAt: userTable.updatedAt,
  } as const

  const sortColumn = sortColumns[sortBy] ?? sortColumns.name
  const orderBy = sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)

  const data = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      attribution: userTable.attribution,
    })
    .from(userTable)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userTable)
    .where(and(...conditions))

  return {
    data,
    limit,
    offset,
    totalCount: Number(countRow?.count ?? 0),
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
  const rows = await getUsersForHydration(ctx.db, ids)

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

/**
 * AUTHZ
 */

const toRoleConditions = (
  roleColumn: AnyColumn,
  filter: { role?: string; roles?: string[]; anyRole?: boolean },
): SQL<unknown>[] => {
  if (filter.anyRole) return []
  if (filter.role) return [eq(roleColumn, filter.role)]
  if ((filter.roles?.length ?? 0) > 0) {
    return [inArray(roleColumn, filter.roles as [string, ...string[]])]
  }
  return []
}

const toEntityRoleExistsCondition = (
  db: Database,
  filter: UserRoleFilter,
): SQL<unknown> => {
  switch (filter.entityType) {
    case 'hub': {
      const roleConditions = toRoleConditions(hubRole.role, filter)
      return exists(
        db
          .select({ userId: hubRole.userId })
          .from(hubRole)
          .where(
            and(
              eq(hubRole.userId, userTable.id),
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
              eq(organisationRole.userId, userTable.id),
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
              eq(projectRole.userId, userTable.id),
              eq(projectRole.projectId, filter.entityId),
              ...roleConditions,
            ),
          ),
      )
    }
  }
}

const resolveParentChain = async (
  db: Database,
  filter: UserParentChainRoleFilter,
): Promise<Array<{ entityType: UserRoleEntityType; entityId: string }>> => {
  if (filter.fromEntityType === 'organisation') {
    const [organisationRecord] = await db
      .select({ hubId: organisation.hubId })
      .from(organisation)
      .where(eq(organisation.id, filter.fromEntityId))
      .limit(1)

    if (!organisationRecord?.hubId) return []

    return [{ entityType: 'hub', entityId: organisationRecord.hubId }]
  }

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

const toParentChainCondition = async (
  db: Database,
  filter: UserParentChainRoleFilter,
): Promise<SQL<unknown>> => {
  const parentEntities = await resolveParentChain(db, filter)
  if (parentEntities.length === 0) return sql`0 = 1`

  const roleConditions = parentEntities.map(parentEntity =>
    toEntityRoleExistsCondition(db, {
      entityType: parentEntity.entityType,
      entityId: parentEntity.entityId,
      role: filter.role,
      roles: filter.roles,
      anyRole: filter.anyRole,
    }),
  )

  return or(...roleConditions) ?? sql`0 = 1`
}
