// DRIZZLE
import { eq, inArray, SQL } from 'drizzle-orm';
// LIB
import { isAdminRequest } from '../index';
// API
import { applyQueryFilters, removeExcludedColumns } from '$lib/api';
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  runAssertions,
  assertProjectMaintainerOrSuperAdmin,
  assertParamIdentifierEqualsFormIdentifier
} from '$lib/auth/asserts';
// DB
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user';
import { getProjectIdforRoles, isSuperAdmin } from '$lib/auth/utils';
// SCHEMA
import { layer, project } from '$lib/db/schema/index';
// DB
import { applyPrismConstraints } from '$lib/db';
import { HierarchicalResource } from '$lib/enums';
// TYPES
import type {
  UserRoleDisco,
  Prisms,
  LayerDB,
  SessionUser,
  Database,
  Id,
  QueryParams,
  LayerDBNew
} from '$lib/types';

/********************
 *  COMMON
 ************/
export const layerCollectionWithRelations = {
  i18n: true,
  properties: {
    with: {
      property: {
        with: {
          i18n: true,
          values: {
            with: {
              i18n: true
            }
          }
        }
      }
    }
  }
};

export const layerEntityWithRelations = {
  ...layerCollectionWithRelations,
  publisher: {
    columns: userColumnsWithPrivacyProtected
  },
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
};

export const layerMergeWithRelations = {
  properties: {
    with: {
      property: {
        with: {
          i18n: true,
          values: {
            with: {
              i18n: true
            }
          }
        }
      }
    }
  }
};

/**
 * Get the query context for the layer resource - filters the query based on the user's roles, prisms, and the query parameters.
 * @param db - The Drizzle instance
 * @param session - The session object
 * @param request - The request object
 * @param params - The query parameters
 * @param userRoles - The user roles
 * @param prisms - The prism filters
 */
export const getLayerQueryContext = (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms
) => {
  // SETUP : By default, only show non-archived layers,
  // and disable isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = [];
  let excludeColumns = ['isArchived', 'isPublished'];

  // NON-SUPERADMIN : Hide layers which are archived
  if (!isSuperAdmin(user)) {
    conditions.push(eq(layer.isArchived, false));
  }

  // FILTER : Apply prism conditions for organisation and project filtering
  if (prisms && db) {
    // Ensure db is available
    conditions.push(...applyPrismConstraints(db, HierarchicalResource.layer, prisms));
  }

  // PUBLIC : List all layers which are isPublished, and not isArchived,
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns);
    conditions.push(eq(layer.isPublished, true));

    // ADMIN : List all layers, where the user has a role in the layer's project
  } else if (!isSuperAdmin(user)) {
    params = removeExcludedColumns(params, ['isArchived']);
    const projectIds = getProjectIdforRoles(userRoles);
    conditions.push(inArray(project.id, projectIds as Id[]));
    // SUPERADMIN : List all layers regardless of isPublished or isArchived, respecting the prism filters.
  } else {
    // For SuperAdmin, if no prisms are applied, conditions must be empty.
    if (!(prisms && db)) {
      conditions = []; // List all layers without the default isArchived filter
    }
  }

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(params).length > 0) {
    // For superAdmins, remove isArchived and isPublished from params so they can see all content
    if (isSuperAdmin(user)) {
      const { isArchived, isPublished, ...filteredParams } = params;
      applyQueryFilters(layer, filteredParams, conditions);
    } else {
      applyQueryFilters(layer, params, conditions);
    }
  }

  return { params, conditions, excludeColumns };
};

/**
 * Get the context for creating or updating a layer
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToCreateLayer = (
  user: SessionUser,
  request: Request,
  formData: LayerDBNew,
  userRoles: UserRoleDisco[]
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request),
    () => assertProjectMaintainerOrSuperAdmin(user, userRoles, formData.projectId!)
  );

  if (assertionError) return assertionError;
};

/**
 * Get the context for creating or updating a layer
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @param refId - The id from the URL parameter
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToUpdateLayer = (
  user: SessionUser,
  request: Request,
  formData: LayerDB,
  userRoles: UserRoleDisco[],
  refId: Id
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request),
    () => assertParamIdentifierEqualsFormIdentifier(formData, refId, 'id'),
    () => assertProjectMaintainerOrSuperAdmin(user, userRoles, formData.projectId!)
  );

  if (assertionError) return assertionError;
};
