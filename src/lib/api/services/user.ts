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
import { isAdminRequest, applyQueryFilters, removeExcludedColumns } from '$lib/api'
import { toTriStateBooleanOrUndefined } from '$lib/api/services'
// AUTH
import {
  assertUserLoggedIn,
  runAssertions,
  assertUserIsSelf,
  assertParamIdentifierEqualsFormIdentifier,
} from '$lib/auth/asserts'
import { isSuperAdmin } from '$lib/client/services/auth'
// SCHEMA
import {
  user,
  hubRole,
  organisation,
  organisationRole,
  project,
  projectRole,
} from '$lib/db/schema/index'
// TYPES
import type {
  UserRoleDisco,
  UserDB,
  SessionUser,
  QueryParams,
  Id,
  Database,
  UserRoleFilter,
  UserParentChainRoleFilter,
  UserRoleEntityType,
} from '$lib/types'

/********************
 *  COMMON
 ************/

export const toRequestedSearchState = (conditions: { isArchived?: unknown }) => {
  // Resolve tri-state archived filter from incoming query conditions.
  const isArchived = toTriStateBooleanOrUndefined(conditions.isArchived)
  return {
    // Default user search to active (non-archived) records.
    isArchived: isArchived === undefined ? false : isArchived,
  }
}

export const isPrivilegedArchivedSearchRequested = (state: {
  isArchived: boolean | null
}): boolean => state.isArchived === true || state.isArchived === null

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

export const userCollectionWithRelations = {
  hubRoles: true,
  organisationRoles: true,
  projectRoles: true,
}

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

/**
 * Get the query context for an user resource - filters the query based on the user's roles, and the query parameters. I.e. only owners of organisations or maintainers of projects can see all the users of the platform as they need to be able to see all the users to manage them. Other roles can only see their own user.
 * @param currentUser - The current user object
 * @param request - The request object
 * @param params - The query parameters
 * @param userRoles - The user roles
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

/**
 * Get the context for updating a user
 * @param session - The session object
 * @param formData - The form data
 * @param refId - The id from the URL parameter
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToUpdateUser = (
  user: SessionUser,
  formData: UserDB,
  refId: Id,
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user as any),
    () => assertParamIdentifierEqualsFormIdentifier(formData, refId, 'id'),
    () => assertUserIsSelf(user, formData.id!),
  )

  if (assertionError) return assertionError
}
