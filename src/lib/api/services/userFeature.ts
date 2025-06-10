// DRIZZLE
import { eq, SQL } from 'drizzle-orm';
// API

import type { Id, SessionUser, UserFeature } from '$lib/types';

import type { QueryParams } from '$lib/types';

import { applyQueryFilters, removeExcludedColumns } from '..';

import { userFeature } from '$lib/db/schema/index';
import { assertUserIsSelf, assertUserLoggedIn, runAssertions } from '$lib/auth/asserts';

/**
 * Get the query context for the userFeature resource - filters the query based on the user's Id -- they should only ever obtain their own features, along with any other query parameters to filter on.
 * @param db - The Drizzle instance
 * @param session - The session object
 * @param request - The request object
 * @param params - The query parameters
 * @param userRoles - The user roles
 * @param prisms - The prism filters
 */
export const getUserFeatureQueryContext = (params: QueryParams, userId: Id) => {
  // SETUP : By default, only show non-archived projects,
  // and exclude isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = [];
  let excludeColumns = ['userId'];
  params = removeExcludedColumns(params, excludeColumns);

  // USER : Only show features for the user
  conditions.push(eq(userFeature.userId, userId));

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(params).length > 0) {
    applyQueryFilters(userFeature, params, conditions);
  }

  return { params, conditions, excludeColumns };
};

/**
 * Get the context for listing user features
 * @param session - The session object
 * @param userId - The user id
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToListUserFeature = (user: SessionUser, userId: Id) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user),
    () => assertUserIsSelf(user, userId)
  );

  if (assertionError) return assertionError;
};

/**
 * Get the context for updating a project
 * @param session - The session object
 * @param userId - The user id
 * @param refId - The id from the URL parameter
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToUpdateUserFeature = (user: SessionUser, userId: Id) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user),
    () => assertUserIsSelf(user, userId)
  );

  if (assertionError) return assertionError;
};

/**
 * Builds response data from database entities
 * @param userFeature - The user feature database entity
 * @returns A parsed response shape
 */
export const toResponseShape = (userFeatures: UserFeature[]) => {
  return userFeatures;
};
