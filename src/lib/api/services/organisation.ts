// DRIZZLE
import { eq, inArray, SQL } from 'drizzle-orm';
// LIB
import { isAdminRequest, applyQueryFilters, removeExcludedColumns } from '$lib/api';
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  assertSuperAdmin,
  runAssertions,
  assertOrganisationOwnerOrSuperAdmin,
  assertIsCoreInclusiveModifiedBySuperAdmin
} from '$lib/auth/asserts';
// DB
import { isFieldUnique } from '$lib/db';
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user';
import { getOrganisationIdforRoles, isSuperAdmin } from '$lib/auth/utils';
// SCHEMA
import { organisation } from '$lib/db/schema';
// ENUMS
import { HierarchicalResource } from '$lib/enums';
// TYPES
import type {
  Id,
  UserRoleDisco,
  OrganisationNew,
  OrganisationDB,
  Session,
  QueryParams,
  Database,
  Organisation,
  Code
} from '$lib/types';
import type { SuperValidated } from 'sveltekit-superforms';

/********************
 *  COMMON
 ************/
export const organisationWithRelations = {
  i18n: true,
  userRoles: {
    with: {
      user: {
        columns: userColumnsWithPrivacyProtected
      }
    }
  },
  image: true,
  publisher: {
    columns: userColumnsWithPrivacyProtected
  }
};


/**
 * Get the query context for the organisation resource - filters the query based on the user's roles, and the query parameters.
 * @param session - The session object
 * @param request - The request object
 * @param params - The query parameters
 * @param userRoles - The user roles
 */
export const getOrganisationQueryContext = (
  session: Session,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[]
) => {
  // SETUP : By default, only show non-archived organisations,
  // and exclude isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = [];
  let excludeColumns = ['isArchived', 'isPublished'];

  // NON-SUPERADMIN : Hide organisations which are archived
  if (!isSuperAdmin(session)) {
    conditions.push(eq(organisation.isArchived, false))
  } 

  // PUBLIC : List all organisations which are isPublished, and not isArchived,
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns);
    conditions.push(eq(organisation.isPublished, true));

  // ADMIN : List all organisations, where the user has a role in the organisation
  } else if (!isSuperAdmin(session as Session & { user: { superAdmin: boolean } })) {
    params = removeExcludedColumns(params, ['isArchived']);
    const organisationIds = getOrganisationIdforRoles(userRoles);
    conditions.push(inArray(organisation.id, organisationIds as Id[]));
  // SUPERADMIN : List all organisations regardless of isPublished or isArchived
  } else {
    conditions = [];
  }

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(params).length > 0) {
    applyQueryFilters(organisation, params, conditions);
  }

  return { params, conditions, excludeColumns };
};

/**
 * Run assertions to check if the user has permissions to create an organisation
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToCreateOrganisation = (
  session: Session,
  request: Request,
  formData: OrganisationNew,
  userRoles: UserRoleDisco[]
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(session as any),
    () => assertAdminRequest(request),
    () => assertSuperAdmin(session)
  );

  if (assertionError) return assertionError;
};

/**
 * Get the context for updating an organisation
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @returns Object containing validation and access control context
 * @remarks We don't need to assert code in params equals code in form,
 * as we want to allow the users to change the code of the organisation.
 */
export const assertPermissionsToUpdateOrganisation = (
  session: Session,
  request: Request,
  formData: OrganisationDB,
  userRoles: UserRoleDisco[],
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(session as any),
    () => assertAdminRequest(request),
    () => assertOrganisationOwnerOrSuperAdmin(session, userRoles, formData.id!),
    () => assertIsCoreInclusiveModifiedBySuperAdmin(session, formData)
  );

  if (assertionError) return assertionError;
};

export const assertCodeUnique = async (
  db: Database,
  form: SuperValidated<OrganisationNew> | SuperValidated<Organisation>,
  formData: OrganisationNew | Organisation
) => {
  // ASSERT : Code is unique
  const codeUnique = await isFieldUnique<Organisation>(
    db,
    formData as Organisation,
    HierarchicalResource.organisation,
    'code'
  );

  if (!codeUnique) {
    form.valid = false;
    form.errors.code = ['Code already exists'];
  }
  return form;
};


/**
 * Check if the current user will lose access upon success, superAdmins are exempt.
 * @param formData - The form data  
 * @param userRoles - The user roles
 * @param session - The session
 * @returns True if the current user will lose access upon success, false otherwise
 */
export const isAccessLostUponSuccess = (
  session: Session & { user: { superAdmin?: boolean } },
  formData: OrganisationNew,
  userRoles?: UserRoleDisco[]
) => {
  const userRolesToCheck = userRoles || formData.userRoles;
  return !(userRolesToCheck as UserRoleDisco[]).some(
    (role) =>
      role.type === 'organisation' &&
      role.organisationId === formData.id &&
      role.userId === session.user!.id
  ) && !session.user.superAdmin;
};
