// SVELTE
import { getRequestEvent, query } from '$app/server'
// ZOD
import { UserSearchQueryParamsSchema } from '$lib/db/zod'
// DRIZZLE
import { and, asc, desc, eq, exists, inArray, like, or, sql } from 'drizzle-orm'
// API
import { setupRequestHandler } from '$lib/api'
// DB
import {
  user,
  hubRole,
  organisation,
  organisationRole,
  project,
  projectRole,
} from '$lib/db/schema'
// TYPES
import type { SQL, AnyColumn } from 'drizzle-orm'
import type {
  Database,
  UserParentChainRoleFilter,
  UserRoleEntityType,
  UserRoleFilter,
} from '$lib/types'

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

/**
 * Search users with optional role-based scope filters.
 *
 * @param params - Search, sorting, pagination, and role filter params.
 * @returns Matching users with list metadata.
 */
export const searchUsers = query(UserSearchQueryParamsSchema, async params => {
  const event = getRequestEvent()
  const { db } = await setupRequestHandler(event)
  // TODO AUTHZ - Guard so only admin users can search all users

  // TODO AUTHZ - SuperAdmin should be able to search all users, not just non-archived ones
  const conditions: SQL<unknown>[] = [eq(user.isArchived, false)]

  const q = params.q?.trim()
  if (q) {
    const qLike = `%${q.toLowerCase()}%`
    conditions.push(
      or(
        like(sql`lower(${user.name})`, qLike),
        like(sql`lower(${user.username})`, qLike),
        like(sql`lower(${user.attribution})`, qLike),
        like(sql`lower(${user.email})`, qLike),
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
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  } as const

  const sortColumn = sortColumns[sortBy] ?? sortColumns.name
  const orderBy = sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)

  const data = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      attribution: user.attribution,
    })
    .from(user)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(user)
    .where(and(...conditions))

  return {
    data,
    limit,
    offset,
    totalCount: Number(countRow?.count ?? 0),
  }
})
