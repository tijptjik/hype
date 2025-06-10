// DRIZZLE
import { eq, inArray, SQL, sql } from 'drizzle-orm';
// LIB
import { isAdminRequest } from '../index';
// API
import { applyQueryFilters } from '$lib/api';
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  runAssertions,
  assertProjectMaintainerOrMemberOrSuperAdmin,
  assertParamIdentifierEqualsFormIdentifier
} from '$lib/auth/asserts';

// DB
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user';
import { getProjectIdforRoles, isSuperAdmin } from '$lib/auth/utils';
// SCHEMA
import { task, feature, layer } from '$lib/db/schema/index';
// DB
import { applyPrismConstraints, transformI18nSafely } from '$lib/db';
// ZOD
import { TaskAPI, TaskCollectionAPI } from '$lib/db/zod/schema/task';
// ENUMS
import { HierarchicalResource } from '$lib/enums';
// TYPES
import type {
  UserRoleDisco,
  Prisms,
  Database,
  Id,
  QueryParams,
  TaskDB,
  TaskDBNew,
  TaskCollection,
  Task,
  TaskDBRaw,
  HubOpts,
  SessionUser,
  Locale,
} from '$lib/types';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. COMMON
//    - taskCollectionWithRelations (const)
//    - taskEntityWithRelations (const)
//
// 2. QUERY CONTEXT
//    - getTaskQueryContext
//    - getTaskEntityQueryContext
//
// 3. ASSERTIONS
//    - assertPermissionsToCreateTask
//    - assertPermissionsToUpdateTask
//    - assertPermissionsToDeleteTask
//

// ═══════════════════════
// 1. COMMON
// ═══════════════════════

export const taskCollectionWithRelations = {
  organisation: {
    with: {
      i18n: true
    }
  },
  project: {
    with: {
      i18n: true
    }
  },
  feature: {
    with: {
      i18n: true
    }
  },
  images: {
    with: {
      image: true
    }
  },
  contributor: {
    columns: userColumnsWithPrivacyProtected
  },
  reviewer: {
    columns: userColumnsWithPrivacyProtected
  }
};

export const taskEntityWithRelations = {
  ...taskCollectionWithRelations,
  feature: {
    with: {
      i18n: true,
      properties: {
        with: {
          propertyValue: {
            with: {
              i18n: true
            }
          },
          property: {
            with: {
              i18n: true
            }
          }
        }
      },
      layer: {
        with: {
          i18n: true,
          project: {
            with: {
              i18n: true,
              organisation: {
                with: {
                  i18n: true
                }
              }
            }
          }
        }
      }
    }
  }
};

// ═══════════════════════
// 2. QUERY CONTEXT
// ═══════════════════════

/**
 * Get the query context for the task resource.
 * Tasks are first-class resources that inherit filtering through features → layers → projects → organisations.
 * Filters the query based on user roles, prisms, hub context, and query parameters.
 */
export const getTaskQueryContext = (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms
) => {
  // SETUP : By default, only show non-archived tasks,
  // and disable isArchived filters from the query for non-superadmins.
  let conditions: SQL<unknown>[] = [];
  let excludeColumns = ['isArchived'];

  // NON-SUPERADMIN : Hide tasks which are archived
  if (!isSuperAdmin(user)) {
    // Tasks don't have isArchived, but their associated features might
    // We'll handle this at the feature level if needed
  }

  // FILTER : Apply prism conditions for organisation, project filtering
  if (prisms && db) {
    conditions.push(...applyPrismConstraints(db, HierarchicalResource.task, prisms));
  }

  // PUBLIC : Tasks are admin-only resources, so public access is not allowed
  if (!isAdminRequest(request)) {
    // Tasks should only be accessible from admin interface
    conditions.push(sql`false`); // Block all public access
  } else if (!isSuperAdmin(user)) {
    // ADMIN : List tasks where the user has a role in the task's project
    const projectIds = getProjectIdforRoles(userRoles);
    if (projectIds.length > 0) {
      conditions.push(inArray(task.projectId, projectIds as Id[]));
    } else {
      conditions.push(sql`false`); // No access if no project roles
    }
  } else {
    // SUPERADMIN : See all tasks
    if (!(prisms && db)) {
      conditions = []; // List all tasks without default filters
    }
  }

  // Apply general query filters from params
  if (Object.keys(params).length > 0) {
    applyQueryFilters(task, params, conditions);
  }

  return { params, conditions, excludeColumns };
};

/**
 * Get the query context for a single task.
 * Tasks are admin-only resources, so public access is not allowed.
 */
export const getTaskEntityQueryContext = (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[]
) => {
  let conditions: SQL<unknown>[] = [];
  let excludeColumns = ['isArchived'];

  // PUBLIC : Tasks are admin-only resources
  if (!isAdminRequest(request)) {
    conditions.push(sql`false`); // Block all public access
  } else if (!isSuperAdmin(user)) {
    // ADMIN : Access tasks where user has project role (direct relationship)
    const projectIds = getProjectIdforRoles(userRoles);
    if (projectIds.length > 0) {
      conditions.push(inArray(task.projectId, projectIds as Id[]));
    } else {
      conditions.push(sql`false`);
    }
  }
  // SUPERADMIN : No additional restrictions

  // Apply general query filters from params
  if (Object.keys(params).length > 0) {
    applyQueryFilters(task, params, conditions);
  }

  return { params, conditions, excludeColumns };
};

// ═══════════════════════
// 3. ASSERTIONS
// ═══════════════════════

/**
 * Asserts permissions to create a task.
 * Any logged in user can create a task.
 */
export const assertPermissionsToCreateTask = async (
  db: Database,
  user: SessionUser,
  request: Request,
  data: TaskDBNew,
  userRoles: UserRoleDisco[]
) => {
  const commonAssertions = [
    () => assertUserLoggedIn({ user } as any),
    () => assertAdminRequest(request)
  ];

  const assertionError = runAssertions(...commonAssertions);
  if (assertionError) return assertionError;
};

/**
 * Asserts permissions to update a task.
 * Tasks can be updated by project maintainers or members who have access to the associated project.
 */
export const assertPermissionsToUpdateTask = async (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  refId: Id,
  taskData?: TaskDB
) => {
  const commonAssertions = [
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request),
    () => assertParamIdentifierEqualsFormIdentifier({ id: params.id }, refId, 'id')
  ];

  // Get project ID through feature hierarchy
  let projectId: Id;
  if (taskData?.projectId) {
    projectId = taskData.projectId;
  } else {
    // Fetch task first to get featureId, then get projectId
    const taskRecord = await db.query.task.findFirst({
      where: eq(task.id, params.id as Id),
      columns: { projectId: true }
    });
    if (!taskRecord) {
      throw new Error('Task not found');
    }
    projectId = taskRecord.projectId;
  }

  const contextAssertion = () =>
    assertProjectMaintainerOrMemberOrSuperAdmin(user, userRoles, projectId);

  const assertionError = runAssertions(...commonAssertions, contextAssertion);
  if (assertionError) return assertionError;
};

/**
 * Asserts permissions to delete a task.
 * Uses same permissions as update - project maintainers or members.
 */
export const assertPermissionsToDeleteTask = async (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  refId: Id,
  taskData?: TaskDB
) => {
  return assertPermissionsToUpdateTask(
    db,
    user,
    request,
    params,
    userRoles,
    refId,
    taskData
  );
};

// ═══════════════════════
// 4. UTILS :: RESPONSE SHAPING
// ═══════════════════════

/**
 * Transform raw task data from database to API response format
 * Converts i18n arrays to locale maps for proper API structure
 */
export const toResponseShape = async (
  data: TaskDBRaw,
  isCollection: boolean = false
): Promise<Task | TaskCollection> => {
  // Transform feature properties if they exist
  const transformedFeature = data.feature
    ? {
        ...data.feature,
        i18n: transformI18nSafely(data.feature.i18n),
        properties:
          data.feature.properties?.map((prop) => ({
            ...prop,
            property: {
              ...prop.property,
              i18n: transformI18nSafely(prop.property.i18n)
            },
            propertyValue: prop.propertyValue
              ? {
                  ...prop.propertyValue,
                  i18n: transformI18nSafely(prop.propertyValue.i18n)
                }
              : null
          })) || []
      }
    : null;

  // Transform the complete data structure
  const transformedData = {
    ...data,
    organisation: data.organisation
      ? {
          ...data.organisation,
          i18n: transformI18nSafely(data.organisation.i18n)
        }
      : null,
    project: data.project
      ? {
          ...data.project,
          i18n: transformI18nSafely(data.project.i18n)
        }
      : null,
    feature: transformedFeature
  };

  return (isCollection ? TaskCollectionAPI : TaskAPI).parse(transformedData);
};
