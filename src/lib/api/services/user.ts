// DRIZZLE
import { eq, SQL } from 'drizzle-orm';
// API
import { isAdminRequest, applyQueryFilters, removeExcludedColumns } from '$lib/api';
// AUTH
import {
  assertUserLoggedIn,
  runAssertions,
  assertUserIsSelf,
  assertParamIdentifierEqualsFormIdentifier
} from '$lib/auth/asserts';
import { isSuperAdmin } from '$lib/auth/utils';
// SCHEMA
import { user } from '$lib/db/schema/index';
// TYPES
import type {
  UserRoleDisco,
  UserDB,
  Session,
  SessionUser,
  QueryParams,
  Id
} from '$lib/types';

/********************
 *  COMMON
 ************/

export const userCollectionWithRelations = {
  memberships: true,
  projectRoles: true
};

export const userEntityWithRelations = {
  memberships: true,
  projectRoles: true,
  userLayers: {
    with: {
      layer: {
        columns: {
          createdAt: false,
          modifiedAt: false
        }
      }
    }
  }
};

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
  userRoles: UserRoleDisco[]
) => {
  // SETUP : By default, exclude isArchived filters from the query, so
  // users cannot see disabled users
  let conditions: SQL<unknown>[] = [];
  let excludeColumns = ['isArchived'];

  // NON-SUPERADMIN : Hide users which are archived
  if (!isSuperAdmin(currentUser)) {
    conditions.push(eq(user.isArchived, false));
  }

  // Helper function to check if user has organisation owner role
  const hasOrganisationOwnerRole = (userRoles: UserRoleDisco[]) => {
    return userRoles.some(
      (role) => role.type === 'organisation' && role.role === 'owner'
    );
  };

  // Helper function to check if user has project maintainer role
  const hasProjectMaintainerRole = (userRoles: UserRoleDisco[]) => {
    return userRoles.some(
      (role) => role.type === 'project' && role.role === 'maintainer'
    );
  };

  // PUBLIC : public requests can only see their own user
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns);
    // Other roles can only see their own user
    conditions.push(eq(user.id, currentUser.id));

    // ADMIN : Check user roles to determine access level
  } else if (!isSuperAdmin(currentUser)) {
    params = removeExcludedColumns(params, excludeColumns);

    // Check if user has organisation owner or project maintainer role
    // ENHANCEMENT : Organisation owners should see all users as we have now, but Project Maintainers should only be able to see members of the organisation.
    const canSeeAllUsers =
      hasOrganisationOwnerRole(userRoles) || hasProjectMaintainerRole(userRoles);

    if (canSeeAllUsers) {
      // Organisation owners and project maintainers can see all users
      // No additional conditions needed
    } else {
      // Other roles can only see their own user
      conditions.push(eq(user.id, currentUser.id));
    }

    // SUPERADMIN : Can see all users regardless of any filters
  } else {
    // No conditions for superadmin, as they can see all users
    conditions = [];
  }

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(params).length > 0) {
    applyQueryFilters(user, params, conditions);
  }

  return { params, conditions, excludeColumns };
};

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
  refId: Id
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user as any),
    () => assertParamIdentifierEqualsFormIdentifier(formData, refId, 'id'),
    () => assertUserIsSelf(user, formData.id!)
  );

  if (assertionError) return assertionError;
};
