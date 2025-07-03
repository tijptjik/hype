// DRIZZLE
import { eq, SQL } from 'drizzle-orm';
// LIB
import { isAdminRequest } from '$lib/api';
// API
import { applyQueryFilters, removeExcludedColumns } from '$lib/api';
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  runAssertions,
  assertProjectMaintainerOrSuperAdmin,
  assertOrganisationOwnerOrSuperAdmin,
  assertProjectMaintainerOrMemberOrSuperAdmin,
  assertParamIdentifierEqualsFormIdentifier
} from '$lib/auth/asserts';
// DB
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user';
import { isSuperAdmin } from '$lib/client/services/auth';
// SCHEMA
import { image, featureImage, project, organisation } from '$lib/db/schema/index';
// TYPES
import type {
  UserRoleDisco,
  Database,
  Id,
  QueryParams,
  ImageNew,
  ImageDBFlat,
  ImageDB,
  HubOpts,
  SessionUser
} from '$lib/types';
import { ImageContextResource, ImageContextResourceExtended } from '$lib/enums';
import { error } from '@sveltejs/kit';
import { applyResourceContextConstraints } from '$lib/db/services/image';
import { getProjectIdForFeatureId } from '$lib/db/services/feature';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CONFIG
//    - intentOrder (const)
//
// 2. COMMON
//    - imageCollectionWithRelations (const)
//    - imageEntityWithRelations (const)
//
// 3. QUERY CONTEXT
//    - getImageQueryContext
//    - getImageEntityQueryContext
//
// 4. ASSERTIONS
//    - assertPermissionsToCreateImage
//    - assertPermissionsToUpdateImage
//    - assertPermissionsToDeleteImage
//
// 5. UTILS
//    - getCtxFromUrl
//

// ═══════════════════════
// 1. CONFIG
// ═══════════════════════

/**
 * The order of intents for feature images.
 */
export const intentOrder = [
  'canonical',
  'closeUp',
  'context',
  'general',
  'undefined',
  'research'
] as const;

export const adminIntentOrder = [
  'undefined',
  'canonical',
  'closeUp',
  'context',
  'general',
  'research'
] as const;

// ═══════════════════════
// 2. COMMON
// ═══════════════════════

export const imageCollectionWithRelations = {
  featureImage: true,
  contributor: {
    columns: userColumnsWithPrivacyProtected
  }
};

export const imageEntityWithRelations = {
  ...imageCollectionWithRelations
};

// ═══════════════════════
// 3. QUERY CONTEXT
// ═══════════════════════

/**
 * Get the query context for the image resource.
 * Filters the query based on user roles, context (featureId, projectId, etc.), and query parameters.
 */
export const getImageQueryContext = (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  ctxId: Id, // ID of the parent resource (e.g., featureId, projectId)
  ctxType: ImageContextResource | ImageContextResourceExtended // Type of the parent resource
) => {
  // SETUP : By default, only show non-archived images,
  // and disable isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = [];
  const excludeColumns = ['isArchived', 'isPublished'];

  // NON-SUPERADMIN : Hide images which are archived
  if (!isSuperAdmin(user)) {
    conditions.push(eq(image.isArchived, false));
  }

  // PUBLIC : List all images which are isPublished, and not isArchived,
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns);
    // For public, typically show images that are marked as published, or if their associated resource is published.
    if (ctxType === ImageContextResource.feature) {
      conditions.push(eq(featureImage.isPublished, true));
    } else if (ctxType === ImageContextResource.project) {
      conditions.push(eq(project.isPublished, true));
    } else if (ctxType === ImageContextResource.organisation) {
      conditions.push(eq(organisation.isPublished, true));
    } else if (ctxType === ImageContextResourceExtended.task) {
      // NO further restrictions on task images, as they are only accessible
      // from the Admin view
    }
  } else {
    // Admin view: allow filtering by isPublished if not a superadmin
    // TODO SECURITY : Technically, currently we allow maintainers to see unpublished feature images, from ANY project if they know the featureId.
    if (!isSuperAdmin(user)) {
      params = removeExcludedColumns(params, ['isArchived']); // Keep isPublished filterable
    } else {
      conditions = []; // Superadmin sees all
    }
  }

  // Filter by context (e.g., images for a specific feature)
  applyResourceContextConstraints(ctxType, ctxId, conditions);

  // Apply general query filters from params
  if (Object.keys(params).length > 0) {
    applyQueryFilters(image, params, conditions);
  }

  return { params, conditions, excludeColumns };
};

/**
 * Get the query context for a single image.
 * All images can be queried if their ID is known, except for images which have isArchived.
 * This is used for the /images/[id] route.
 */
export const getImageEntityQueryContext = (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams
) => {
  // SETUP : By default, only show non-archived images,
  // and disable isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = [];
  const excludeColumns = ['isArchived', 'isPublished'];

  // NON-SUPERADMIN : Hide images which are archived
  if (!isSuperAdmin(user)) {
    conditions.push(eq(image.isArchived, false));
  }

  // PUBLIC : List all images which are isPublished, and not isArchived,
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns);
  } else {
    // Admin view: allow filtering by isPublished if not a superadmin
    if (!isSuperAdmin(user)) {
      params = removeExcludedColumns(params, ['isArchived']); // Keep isPublished filterable
    } else {
      conditions = []; // Superadmin sees all
    }
  }

  // Apply general query filters from params
  if (Object.keys(params).length > 0) {
    applyQueryFilters(image, params, conditions);
  }

  return { params, conditions, excludeColumns };
};

// ═══════════════════════
// 4. ASSERTIONS
// ═══════════════════════

/**
 * Asserts permissions to create an image for a given context (feature, project, etc.). Images are a second-class resource, and are always created in the context of a first-class resource : organisation, project, or feature. Images are only created directly from the admin interface, and not from the API. From the front-end, images are created indirectly by creating a task (newFeature, MissingReport or newPhoto) which in turn creates an image.
 */
export const assertPermissionsToCreateImage = async (
  db: Database,
  user: SessionUser,
  request: Request,
  hubOpts: HubOpts,
  data: ImageNew,
  userRoles: UserRoleDisco[],
  ctxType: ImageContextResource,
  ctxId: Id
) => {
  const commonAssertions = [
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request)
  ];

  let contextAssertion = () => {}; // Placeholder for context-specific assertion

  switch (ctxType) {
    case ImageContextResource.feature:
      const projectId = await getProjectIdForFeatureId(db, ctxId as Id, hubOpts);
      contextAssertion = () =>
        assertProjectMaintainerOrMemberOrSuperAdmin(user, userRoles, projectId);
      break;
    case ImageContextResource.project:
      contextAssertion = () =>
        assertProjectMaintainerOrSuperAdmin(user, userRoles, ctxId);
      break;
    case ImageContextResource.organisation:
      contextAssertion = () =>
        assertOrganisationOwnerOrSuperAdmin(user, userRoles, ctxId);
      break;
  }

  const assertionError = runAssertions(...commonAssertions, contextAssertion);
  if (assertionError) return assertionError;
};

/**
 * Asserts permissions to update/delete an image.
 * This might depend on who uploaded it, or roles in the associated context.
 */
export const assertPermissionsToUpdateImage = async (
  db: Database,
  user: SessionUser,
  request: Request,
  hubOpts: HubOpts,
  params: QueryParams,
  data: ImageDBFlat,
  userRoles: UserRoleDisco[],
  refId: Id,
  ctxId: Id,
  ctxType: ImageContextResource | ImageContextResourceExtended
) => {
  const commonAssertions = [
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request),
    () => assertParamIdentifierEqualsFormIdentifier(data, refId, 'id')
  ];

  // Implement logic to determine who can update/delete.
  // 1. Users with specific roles in the context (feature's project members/maintainers, organisation's owners, project's maintainers).
  // 2. SuperAdmins.
  let contextAssertion = () => {}; // Placeholder

  switch (ctxType) {
    case ImageContextResource.feature:
      const projectId = await getProjectIdForFeatureId(db, ctxId as Id, hubOpts);
      contextAssertion = () =>
        assertProjectMaintainerOrMemberOrSuperAdmin(user, userRoles, projectId);
      break;
    case ImageContextResource.project:
      contextAssertion = () =>
        assertProjectMaintainerOrSuperAdmin(user, userRoles, ctxId);
      break;
    case ImageContextResource.organisation:
      contextAssertion = () =>
        assertOrganisationOwnerOrSuperAdmin(user, userRoles, ctxId);
      break;
  }

  const assertionError = runAssertions(...commonAssertions, contextAssertion);
  if (assertionError) return assertionError;
};

export const assertPermissionsToDeleteImage = async (
  db: Database,
  user: SessionUser,
  request: Request,
  hubOpts: HubOpts,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  refId: Id,
  ctxId: Id,
  ctxType: ImageContextResource | ImageContextResourceExtended
) => {
  return assertPermissionsToUpdateImage(
    db,
    user,
    request,
    hubOpts,
    params,
    { id: refId } as ImageDBFlat,
    userRoles,
    refId,
    ctxId,
    ctxType
  );
};

// ═══════════════════════
// 5. UTILS
// ═══════════════════════

export const getCtxFromUrl = (url: URL) => {
  const organisationId = url.searchParams.get('organisationId');
  const projectId = url.searchParams.get('projectId');
  const featureId = url.searchParams.get('featureId');
  const taskId = url.searchParams.get('taskId');

  let ctxId: Id | null = null;
  let ctxType: ImageContextResource | ImageContextResourceExtended | null = null;

  if (featureId) {
    ctxId = featureId;
    ctxType = ImageContextResource.feature;
  } else if (projectId) {
    ctxId = projectId;
    ctxType = ImageContextResource.project;
  } else if (organisationId) {
    ctxId = organisationId;
    ctxType = ImageContextResource.organisation;
  } else if (taskId) {
    ctxId = taskId;
    ctxType = ImageContextResourceExtended.task;
  } else {
    return error(400, 'A featureId, organisationId, projectId, or taskId is required');
  }

  return { ctxId, ctxType };
};
