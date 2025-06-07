// DRIZZLE
import { eq, inArray, SQL } from 'drizzle-orm';
// API
import {isAdminRequest, applyQueryFilters, removeExcludedColumns } from '$lib/api';
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  assertId,
  runAssertions,
  assertOrganisationOwnerOrSuperAdmin,
  assertParamIdentifierEqualsFormIdentifier
} from '$lib/auth/asserts';
// DB
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user';
import { getProjectIdforRoles, isSuperAdmin } from '$lib/auth/utils';
// SCHEMA
import { project } from '$lib/db/schema';
// DB
import { applyPrismConstraints, isFieldUnique } from '$lib/db';
import { HierarchicalResource } from '$lib/enums';
// TYPES
import type {
  UserRoleDisco,
  ProjectNew,
  Prisms,
  ProjectDB,
  Database,
  Session,
  Id,
  QueryParams,
  Project,
  Code
} from '$lib/types';
import type { SuperValidated } from 'sveltekit-superforms';

/********************
 *  COMMON
 ************/
export const projectCollectionWithRelations = {
  i18n: true,
  image: true
};

export const projectEntityWithRelations = {
  i18n: true,
  maintainerRoles: {
    with: {
      user: {
        columns: userColumnsWithPrivacyProtected
      }
    }
  },
  properties: {
    with: {
      i18n: true,
      values: {
        with: {
          i18n: true
        }
      }
    }
  },
  image: true,
  publisher: true
};

/**
 * Get the query context for the project resource - filters the query based on the user's roles, prisms, and the query parameters.
 * @param db - The Drizzle instance
 * @param session - The session object
 * @param request - The request object
 * @param params - The query parameters
 * @param userRoles - The user roles
 * @param prisms - The prism filters
 */
export const getProjectQueryContext = (
  db: Database,
  session: Session,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms
) => {
  // SETUP : By default, only show non-archived projects,
  // and exclude isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = [];
  let excludeColumns = ['isArchived', 'isPublished'];

  // NON-SUPERADMIN : Hide projects which are archived
  if (!isSuperAdmin(session)) {
    conditions.push(eq(project.isArchived, false));
  }

  // Apply prism conditions for organisation filtering
  if (prisms && db) {
    // Ensure db is available
    conditions.push(...applyPrismConstraints(db, HierarchicalResource.project, prisms));
  }

  // PUBLIC : List all projects which are isPublished, and not isArchived,
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns);
    conditions.push(eq(project.isPublished, true));

    // ADMIN : List all projects, where the user has a role in the project
  } else if (!isSuperAdmin(session as Session & { user: { superAdmin: boolean } })) {
    params = removeExcludedColumns(params, ['isArchived']);
    const projectIds = getProjectIdforRoles(userRoles);
    conditions.push(inArray(project.id, projectIds as Id[]));
    // SUPERADMIN : List all projects regardless of isPublished or isArchived, respecting the prism filters.
  } else {
    // For SuperAdmin, if no prisms are applied, conditions must be empty.
    if (!(prisms && db)) {
      conditions = []; // List all projects without the default isArchived filter for superadmins
    }
  }

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(params).length > 0) {
    applyQueryFilters(project, params, conditions);
  }

  return { params, conditions, excludeColumns };
};

/**
 * Run assertions to check if the user has permissions to create a project
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToCreateProject = (
  session: Session,
  request: Request,
  formData: ProjectNew,
  userRoles: UserRoleDisco[]
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(session),
    () => assertAdminRequest(request),
    () =>
      assertOrganisationOwnerOrSuperAdmin(session, userRoles, formData.organisationId!) // Only allow org owners to create projects
  );

  if (assertionError) return assertionError;
};

/**
 * Get the context for updating a project
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @param refId - The code from the URL parameter
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToUpdateProject = (
  session: Session,
  request: Request,
  formData: ProjectDB,
  userRoles: UserRoleDisco[],
  refId: Code
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(session as any),
    () => assertAdminRequest(request),
    () => assertParamIdentifierEqualsFormIdentifier(formData, refId, 'code'),
    () =>
      assertOrganisationOwnerOrSuperAdmin(session, userRoles, formData.organisationId!) // Only allow org owners to update projects
  );

  if (assertionError) return assertionError;
};

export const assertCodeUnique = async (
  db: Database,
  form: SuperValidated<ProjectNew> | SuperValidated<Project>,
  formData: ProjectNew | Project
) => {
  // ASSERT : Code is unique
  const codeUnique = await isFieldUnique<Project>(
    db,
    formData as Project,
    HierarchicalResource.project,
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
  formData: ProjectNew,
  userRoles?: UserRoleDisco[]
) => {
  const userRolesToCheck = userRoles || (formData.maintainerRoles as UserRoleDisco[]);
  return (
    !userRolesToCheck.some(
      (role: any) =>
        role.type === 'project' &&
        role.projectId === formData.id &&
        role.userId === session.user.id
    ) && !session.user.superAdmin
  );
};
