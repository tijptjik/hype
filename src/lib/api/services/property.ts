import { property, project as projectTable } from '$lib/db/schema/index'
import type {
  Database,
  Prisms,
  QueryParams,
  UserRoleDisco,
  SessionUser,
} from '$lib/types'
import type { SQL } from 'drizzle-orm'
import { inArray } from 'drizzle-orm'
import { applyQueryFilters } from '..'

/********************
 *  COMMON
 ************/

export const propertyCollectionWithRelations = {
  i18n: true,
  values: {
    with: {
      i18n: true,
    },
  },
}

export const propertyEntityWithRelations = {
  ...propertyCollectionWithRelations,
}

/* ----------------- */
// REMOTE FUNCTION REFACTOR
/* -------- */

export const toPropertyPrismConditions = async (params: {
  db: Database
  prisms: Prisms
  conditions?: SQL<unknown>[]
}): Promise<SQL<unknown>[]> => {
  const scopedConditions = [...(params.conditions ?? [])]

  if (params.prisms.project.length > 0) {
    scopedConditions.push(inArray(property.projectId, params.prisms.project))
    return scopedConditions
  }

  if (params.prisms.organisation.length > 0) {
    const projectsInOrgs = await params.db.query.project.findMany({
      where: inArray(projectTable.organisationId, params.prisms.organisation),
      columns: { id: true },
    })
    const projectIds = projectsInOrgs.map(project => project.id)
    if (projectIds.length > 0) {
      scopedConditions.push(inArray(property.projectId, projectIds))
    }
  }

  return scopedConditions
}

/**
 * Get the query context for the property resource - filters the query based on the user's roles, and the query parameters.
 * @param session - The session object
 * @param request - The request object
 * @param params - The query parameters
 * @param userRoles - The user roles
 */
export const getPropertyQueryContext = (
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
) => {
  // SETUP : By default, only show non-archived organisations,
  // and exclude isArchived and isPublished filters from the query.
  const conditions: SQL<unknown>[] = []
  const excludeColumns: string[] = []

  // PUBLIC : List all properties
  // ADMIN : List all properties

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(params).length > 0) {
    applyQueryFilters(property, params, conditions)
  }

  return { params, conditions, excludeColumns }
}
