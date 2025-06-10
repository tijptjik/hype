import { property } from '$lib/db/schema/index';
import type { QueryParams, UserRoleDisco, SessionUser } from '$lib/types';
import type { SQL } from 'drizzle-orm';
import { applyQueryFilters } from '..';

/********************
 *  COMMON
 ************/

export const propertyCollectionWithRelations = {
  i18n: true,
  values: {
    with: {
      i18n: true
    }
  }
};

export const propertyEntityWithRelations = {
  ...propertyCollectionWithRelations
};

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
  userRoles: UserRoleDisco[]
) => {
  // SETUP : By default, only show non-archived organisations,
  // and exclude isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = [];
  let excludeColumns: string[] = [];

  // PUBLIC : List all properties
  // ADMIN : List all properties

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(params).length > 0) {
    applyQueryFilters(property, params, conditions);
  }

  return { params, conditions, excludeColumns };
};
