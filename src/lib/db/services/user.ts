// ENV
import { and, asc, desc, type SQL, eq, inArray, like, sql, or } from 'drizzle-orm'
import { user, userFeature, userLayer } from '../schema'
// TYPES
import type {
  Id,
  UserPartial,
  UserLayerDB,
  UserDB,
  UserRoleDisco,
  Database,
  UserFeatureDB,
  UserLayerNew,
} from '$lib/types'
import { update } from '../crud'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. COMMON
//    - userColumnsWithPrivacyProtected (const)
//
// 2.1 CRUD :: READ
//    - getUser
//    - getUserById
//    - getUsersForHydration
//
// 2.2 CRUD :: READ (SEARCH)
//    - searchUsersByConditions
//    - toSearchCondition
//
// 2.3 CRUD :: READ (RELATED)
//    - getUserRoles
//    - getUserLayersByUserId
//    - getUserFeaturesByUserId
//
// 3.1 CRUD :: UPDATE
//    - updateUser
//
// 3.2 CRUD :: UPDATE (RELATED)
//    - updateUserLayers
//    - upsertUserFeatureState
//    - removeUserFeatureListState
//
// 4. CRUD :: DELETE
//    - No hard delete helpers in this module (intentional)
//

// ═══════════════════════
// 1. COMMON
// ═══════════════════════

export const userColumnsWithPrivacyProtected = {
  id: true,
  name: true,
  image: true,
  attribution: true,
}

// ═══════════════════════
// 2.1 CRUD :: READ
// ═══════════════════════

/**
 * Loads a single user with optional relation graph and column projection.
 *
 * @param db - Database handle.
 * @param withRelations - Drizzle relation graph to hydrate.
 * @param conditions - SQL predicates applied with `AND`.
 * @param columns - Optional column projection for the base `user` table.
 * @returns Matching user row or `undefined`.
 */
export const getUser = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  columns?: Record<string, boolean>,
): Promise<UserDB | undefined> =>
  await db.query.user.findFirst({
    with: withRelations,
    where: and(...conditions),
    ...(columns ? { columns } : {}),
  })

/**
 * Loads a single user by id.
 *
 * @param db - Database handle.
 * @param userId - Target user id.
 * @param columns - Optional column projection for the base `user` table.
 * @returns Matching user row or `undefined`.
 */
export const getUserById = async (
  db: Database,
  userId: Id,
  columns?: Record<string, boolean>,
): Promise<UserDB | undefined> => await getUser(db, {}, [eq(user.id, userId)], columns)

/**
 * Loads lightweight user rows used by attribution/card hydration flows.
 *
 * @param db - Database handle.
 * @param ids - User ids to fetch.
 * @returns Minimal user payloads preserving privacy constraints.
 */
export const getUsersForHydration = async (
  db: Database,
  ids: Id[],
): Promise<
  Array<
    Pick<UserDB, 'id' | 'name' | 'image' | 'attribution' | 'username' | 'isArchived'>
  >
> => {
  if (ids.length === 0) return []

  return await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      attribution: user.attribution,
      username: user.username,
      isArchived: user.isArchived,
    })
    .from(user)
    .where(inArray(user.id, ids))
}

// ═══════════════════════
// 2.2 CRUD :: READ (SEARCH)
// ═══════════════════════

/**
 * Executes paginated user search from prebuilt SQL conditions.
 *
 * @param db - Database handle.
 * @param params - Search conditions, paging, and sorting options.
 * @returns Page data and total count.
 */
export const searchUsersByConditions = async (
  db: Database,
  params: {
    conditions: SQL<unknown>[]
    limit: number
    offset: number
    sortBy: 'name' | 'email' | 'createdAt' | 'updatedAt'
    sortOrder: 'asc' | 'desc'
  },
): Promise<{
  data: Array<{
    id: string
    name: string | null
    username: string | null
    email: string | null
    image: unknown
  }>
  totalCount: number
}> => {
  const sortColumns = {
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  } as const

  const sortColumn = sortColumns[params.sortBy] ?? sortColumns.name
  const orderBy = params.sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)

  const data = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      image: user.image,
    })
    .from(user)
    .where(and(...params.conditions))
    .orderBy(orderBy)
    .limit(params.limit)
    .offset(params.offset)

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(user)
    .where(and(...params.conditions))

  return {
    data,
    totalCount: Number(countRow?.count ?? 0),
  }
}

/**
 * Builds a case-insensitive full-text-like condition across searchable user fields.
 *
 * @param q - Raw search text.
 * @returns SQL condition that can be appended to user queries.
 */
export const toSearchCondition = (q: string): SQL<unknown> => {
  const qLike = `%${q.toLowerCase()}%`
  return (
    or(
      like(sql`lower(${user.name})`, qLike),
      like(sql`lower(${user.username})`, qLike),
      like(sql`lower(${user.attribution})`, qLike),
      like(sql`lower(${user.email})`, qLike),
    ) ?? sql`1 = 0`
  )
}

// ═══════════════════════
// 2.3 CRUD :: READ (RELATED)
// ═══════════════════════

/**
 * Fetches and constructs user roles from hub, organisation, and project scopes.
 *
 * @param db - Database handle.
 * @param userId - Target user id.
 * @returns Combined role list with explicit `type` discriminator per scope.
 *
 * @remarks
 * This combines:
 * - hub roles (`type: 'hub'`)
 * - organisation roles (`type: 'organisation'`)
 * - project roles (`type: 'project'`)
 * so callers can evaluate cross-scope permissions from one payload.
 */
export const getUserRoles = async (
  db: Database,
  userId: Id,
): Promise<UserRoleDisco[]> => {
  const hubRoles = await db.query.hubRole.findMany({
    where: (hubRole, { eq }) => eq(hubRole.userId, userId),
    with: {
      hub: {
        columns: {
          code: true,
        },
      },
    },
  })

  const orgRoles = await db.query.organisationRole.findMany({
    where: (organisationRole, { eq }) => eq(organisationRole.userId, userId),
    with: {
      organisation: {
        with: {
          i18n: true,
        },
      },
    },
  })

  const projectRoles = await db.query.projectRole.findMany({
    where: (projectRole, { eq }) => eq(projectRole.userId, userId),
    with: {
      project: {
        with: {
          i18n: true,
          organisation: {
            with: {
              i18n: true,
            },
          },
        },
      },
    },
  })

  return [
    ...hubRoles.map(role => ({
      ...role,
      type: 'hub',
    })),
    ...orgRoles.map(role => ({
      ...role,
      type: 'organisation',
    })),
    ...projectRoles.map(role => ({
      ...role,
      type: 'project',
    })),
  ] as UserRoleDisco[]
}

/**
 * Loads per-user layer defaults.
 *
 * @param db - Database handle.
 * @param userId - Target user id.
 * @returns Layer preference rows for the user.
 */
export const getUserLayersByUserId = async (
  db: Database,
  userId: Id,
): Promise<UserLayerDB[]> =>
  await db.select().from(userLayer).where(eq(userLayer.userId, userId))

/**
 * Loads paginated feature list-state rows (`visited` / `wishlist`) for a user.
 *
 * @param db - Database handle.
 * @param params - User id plus optional filters, pagination, and sorting.
 * @returns Feature state rows and total count.
 */
export const getUserFeaturesByUserId = async (
  db: Database,
  params: {
    userId: Id
    conditions?: {
      isVisited?: boolean | null
      isWishlisted?: boolean | null
    }
    pagination?: {
      limit?: number
      offset?: number
    }
    sorting?: {
      sortBy?: 'visitedAt' | 'createdAt' | 'modifiedAt'
      sortOrder?: 'asc' | 'desc'
    }
  },
): Promise<{ data: UserFeatureDB[]; totalCount: number }> => {
  const conditions: SQL<unknown>[] = [eq(userFeature.userId, params.userId)]
  const isVisited = params.conditions?.isVisited
  const isWishlisted = params.conditions?.isWishlisted
  if (isVisited !== undefined && isVisited !== null) {
    conditions.push(eq(userFeature.isVisited, isVisited))
  }
  if (isWishlisted !== undefined && isWishlisted !== null) {
    conditions.push(eq(userFeature.isWishlisted, isWishlisted))
  }

  const limit = Math.min(params.pagination?.limit ?? 50, 100)
  const offset = params.pagination?.offset ?? 0
  const sortBy = params.sorting?.sortBy ?? 'modifiedAt'
  const sortOrder = params.sorting?.sortOrder === 'asc' ? 'asc' : 'desc'
  const sortColumn =
    sortBy === 'visitedAt'
      ? userFeature.visitedAt
      : sortBy === 'createdAt'
        ? userFeature.createdAt
        : userFeature.modifiedAt
  const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn)

  const data = await db
    .select()
    .from(userFeature)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userFeature)
    .where(and(...conditions))

  return {
    data,
    totalCount: Number(countRow?.count ?? 0),
  }
}

// ═══════════════════════
// 3.1 CRUD :: UPDATE
// ═══════════════════════

/**
 * Updates an existing user in the database
 * @param db - The database instance
 * @param data - The user data to update
 * @param userId - The ID of the user to update
 * @returns The updated user
 * @throws {Error} If the user update fails or user is not found
 */
export const updateUser = async (
  db: Database,
  data: UserPartial,
  userId: Id,
): Promise<UserDB> => await update(db, user, data, user.id, userId)

// ═══════════════════════
// 3.2 CRUD :: UPDATE (RELATED)
// ═══════════════════════

/**
 * Replaces a user's layer defaults with the submitted list.
 *
 * @param db - Database handle.
 * @param userLayers - Layer preference rows to persist.
 * @param userId - Target user id.
 * @returns Persisted user-layer rows.
 */
export const updateUserLayers = async (
  db: Database,
  userLayers: UserLayerNew[],
  userId: Id,
): Promise<UserLayerDB[]> => {
  // Delete existing layer preferences
  await db.delete(userLayer).where(eq(userLayer.userId, userId))

  // If no new preferences, we're done
  if (!userLayers?.length) return []

  // Insert new layer preferences
  return await db.insert(userLayer).values(userLayers).returning()
}

/**
 * Upserts one user-feature list-state row.
 *
 * @param db - Database handle.
 * @param params - User/feature ids plus optional state fields.
 * @returns Persisted feature state row.
 */
export const upsertUserFeatureState = async (
  db: Database,
  params: {
    userId: Id
    featureId: Id
    isVisited?: boolean
    isWishlisted?: boolean
    visitedAt?: string | null
  },
): Promise<UserFeatureDB> => {
  const [existing] = await db
    .select()
    .from(userFeature)
    .where(
      and(
        eq(userFeature.userId, params.userId),
        eq(userFeature.featureId, params.featureId),
      ),
    )
    .limit(1)

  if (existing) {
    const [updated] = await db
      .update(userFeature)
      .set({
        isVisited: params.isVisited ?? existing.isVisited,
        isWishlisted: params.isWishlisted ?? existing.isWishlisted,
        visitedAt:
          params.visitedAt !== undefined ? params.visitedAt : existing.visitedAt,
      })
      .where(
        and(
          eq(userFeature.userId, params.userId),
          eq(userFeature.featureId, params.featureId),
        ),
      )
      .returning()

    return updated as UserFeatureDB
  }

  const [created] = await db
    .insert(userFeature)
    .values({
      userId: params.userId,
      featureId: params.featureId,
      isVisited: params.isVisited ?? false,
      isWishlisted: params.isWishlisted ?? false,
      visitedAt: params.visitedAt ?? null,
    })
    .returning()

  return created as UserFeatureDB
}

/**
 * Removes one list flag (`wishlist` or `visited`) from a user-feature row.
 * If both flags become false, the row is deleted.
 *
 * @param db - Database handle.
 * @param params - User/feature ids and list flag to clear.
 * @returns Updated row, or `null` when deleted/missing.
 */
export const removeUserFeatureListState = async (
  db: Database,
  params: {
    userId: Id
    featureId: Id
    list: 'wishlist' | 'visited'
  },
): Promise<UserFeatureDB | null> => {
  const [existing] = await db
    .select()
    .from(userFeature)
    .where(
      and(
        eq(userFeature.userId, params.userId),
        eq(userFeature.featureId, params.featureId),
      ),
    )
    .limit(1)

  if (!existing) return null

  const nextState =
    params.list === 'wishlist'
      ? {
          isWishlisted: false,
          isVisited: existing.isVisited,
          visitedAt: existing.visitedAt,
        }
      : {
          isWishlisted: existing.isWishlisted,
          isVisited: false,
          visitedAt: null,
        }

  if (!nextState.isWishlisted && !nextState.isVisited) {
    await db
      .delete(userFeature)
      .where(
        and(
          eq(userFeature.userId, params.userId),
          eq(userFeature.featureId, params.featureId),
        ),
      )
    return null
  }

  const [updated] = await db
    .update(userFeature)
    .set(nextState)
    .where(
      and(
        eq(userFeature.userId, params.userId),
        eq(userFeature.featureId, params.featureId),
      ),
    )
    .returning()

  return updated as UserFeatureDB
}
