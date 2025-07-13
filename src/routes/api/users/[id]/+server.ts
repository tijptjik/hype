// SVELTEKIT
import { error, type RequestHandler } from '@sveltejs/kit';
// I18n
import { m } from '$lib/i18n';
// DRIZZLE
import { eq, or, SQL, inArray, and } from 'drizzle-orm';
// DB
import { user, feature, featureImage } from '$lib/db/schema/index';
import {
  getUser,
  updateUser,
  toResponseShape,
  updateUserFeatures,
  updateUserLayers
} from '$lib/db/services/user';
// API
import {
  JSONResponseOrError,
  getDatabase,
  logZodError,
  getPrisms,
  isAdminRequest
} from '$lib/api';
import {
  getUserQueryContext,
  userEntityWithRelations,
  assertPermissionsToUpdateUser
} from '$lib/api/services/user';
// DB
import { applyPrismConstraints } from '$lib/db';
import { HierarchicalResource } from '$lib/enums';
// HUB FILTERING
import { getFeatureHubFilter } from '$lib/db/services/hub';
// UTILS
import { makeUrlSafeUsername } from '$lib/utils/username';
// TYPES
import type {
  UserPartial,
  UserDB,
  UserRaw,
  Id,
  UserFeatureDB,
  UserLayerDB
} from '$lib/types';

/********************
 *  READ
 ************/

/**
 * Reads a user by ID or username
 */
export const GET: RequestHandler = async ({ params, locals, platform, request }) => {
  // ASSERT : User logged in
  const { db, user: sessionUser, userRoles } = await getDatabase(locals, platform);

  // PRISMS : Extract prisms from URL parameters
  const url = new URL(request.url);
  const prisms = getPrisms(url);

  // HUB : Get hub options from locals (use union type to handle both cases)
  const hubOpts = locals.hub || { isCore: true };

  // CONTEXT : Get the query context - this applies filters based on the user's permissions and the query parameters.
  const { conditions } = getUserQueryContext(
    sessionUser!,
    request,
    {},
    userRoles,
    false
  );

  try {
    // Add condition for specific user ID or username - using the same pattern as auth.ts
    const userCondition = or(eq(user.id, params.id!), eq(user.username, params.id!));
    if (userCondition) {
      conditions.push(userCondition);
    }

    // Create constraint conditions for features
    const featureConstraints: SQL<unknown>[] = [];

    // Add prism constraints if they exist
    if (
      prisms &&
      (prisms.organisation.length > 0 ||
        prisms.project.length > 0 ||
        prisms.layer.length > 0)
    ) {
      featureConstraints.push(
        ...applyPrismConstraints(db, HierarchicalResource.feature, prisms)
      );
    }

    // Add hub constraints - superAdmins only bypass filtering in admin panel
    const isCore = 'isCore' in hubOpts ? hubOpts.isCore : true;
    const isAdminPanelRequest = isAdminRequest(request);
    const shouldApplyHubFilter = !sessionUser?.superAdmin || !isAdminPanelRequest;

    if (shouldApplyHubFilter) {
      if (isCore) {
        // Core hub: use preloaded organizations to filter out hub-exclusive ones
        if ('organisations' in hubOpts && hubOpts.organisations?.length) {
          const nonHubExclusiveOrgIds = hubOpts.organisations
            .filter((org) => !org.isHubExclusive)
            .map((org) => org.id);

          if (nonHubExclusiveOrgIds.length > 0) {
            // Features: filter directly by organisationId
            featureConstraints.push(
              inArray(feature.organisationId, nonHubExclusiveOrgIds)
            );
          }
        } else {
          // Fallback to query-based filtering if no preloaded organizations
          const hubFilterOpts = {
            hubCode: 'code' in hubOpts ? hubOpts.code : undefined,
            hubDomain: 'domain' in hubOpts ? hubOpts.domain || undefined : undefined,
            isCore: isCore,
            isSuperAdmin: sessionUser?.superAdmin && isAdminPanelRequest
          };

          const featureHubFilter = getFeatureHubFilter(db, hubFilterOpts);
          if (featureHubFilter) {
            featureConstraints.push(featureHubFilter);
          }
        }
      } else {
        // Specific hub: use preloaded organizations
        if ('organisations' in hubOpts && hubOpts.organisations?.length) {
          const hubOrgIds = hubOpts.organisations.map((org) => org.id);
          // Features: filter directly by organisationId
          featureConstraints.push(inArray(feature.organisationId, hubOrgIds));
        } else {
          // Fallback to query-based filtering if no preloaded organizations
          const hubFilterOpts = {
            hubCode: 'code' in hubOpts ? hubOpts.code : undefined,
            hubDomain: 'domain' in hubOpts ? hubOpts.domain || undefined : undefined,
            isCore: isCore,
            isSuperAdmin: sessionUser?.superAdmin && isAdminPanelRequest
          };

          const featureHubFilter = getFeatureHubFilter(db, hubFilterOpts);
          if (featureHubFilter) {
            featureConstraints.push(featureHubFilter);
          }
        }
      }
    }
    // Create enhanced relations that include both prism and hub filtering for contributed features and images
    const userRelationsWithPrisms = {
      ...userEntityWithRelations,
      contributedFeatures: {
        columns: {
          id: true,
          isPublished: true,
          projectId: true
        },
        // Apply combined prism and hub constraints to contributed features
        where:
          featureConstraints.length > 0
            ? inArray(
                feature.id,
                db
                  .select({ id: feature.id })
                  .from(feature)
                  .where(and(...featureConstraints))
              )
            : undefined
      },
      contributedImages: {
        columns: {
          id: true
        },
        with: {
          featureImage: {
            columns: {
              isPublished: true,
              featureId: true
            },
            with: {
              feature: {
                columns: {
                  projectId: true
                }
              }
            },
            // Filter featureImage relations to only include features from allowed organizations
            where:
              featureConstraints.length > 0
                ? inArray(
                    featureImage.featureId,
                    db
                      .select({ id: feature.id })
                      .from(feature)
                      .where(and(...featureConstraints))
                  )
                : undefined
          }
        }
      }
    };

    // DB : Get the user
    const result = (await getUser(db, userRelationsWithPrisms, conditions)) as UserRaw;

    if (!result) {
      return error(404, 'User not found or access denied');
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      result,
      result.userLayers || [],
      result.userFeatures || [],
      false,
      sessionUser!.superAdmin
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'User read error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  UPDATE :: PATCH
 ************/

/**
 * Partially updates a user
 */
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user: sessionUser } = await getDatabase(locals, platform);

  // ASSERT : Valid form data - move outside try-catch
  const rawData: UserPartial = await request.json();

  // Get the existing user to verify access OUTSIDE try-catch
  const existing = (await getUser(db, {}, [
    eq(user.id, params.id as string)
  ])) as UserDB;

  if (!existing)
    return error(
      404,
      m.resource_not_found({ resourceType: m.ornate_happy_meerkat_roam() })
    );

  // ASSERT : Permissions to update user OUTSIDE try-catch
  assertPermissionsToUpdateUser(sessionUser!, existing, params.id as Id);

  // PROCESS : Handle username/displayUsername conversion logic
  const newData: UserPartial = { ...rawData };

  if (newData.displayUsername) {
    // If displayUsername is provided, make it URL-safe for username
    newData.username = makeUrlSafeUsername(newData.displayUsername);
  } else if (newData.username && !newData.displayUsername) {
    // If only username is provided, ensure it's URL safe, and then set both fields to the same value
    const usernameSafe = makeUrlSafeUsername(newData.username);
    newData.displayUsername = usernameSafe;
    newData.username = usernameSafe;
  }

  try {
    // DB : Update the userBase (no relations for PATCH)
    const updated = await updateUser(db, newData, params.id as string);
    let updatedFeatures: UserFeatureDB[] = [];
    let updatedLayers: UserLayerDB[] = [];

    // DB : Update the userFeatures
    if (newData.userFeatures) {
      updatedFeatures = await updateUserFeatures(
        db,
        newData.userFeatures,
        params.id as string
      );
    }

    // DB : Update the userLayers
    if (newData.userLayers) {
      updatedLayers = await updateUserLayers(
        db,
        newData.userLayers,
        params.id as string
      );
    }

    // DB : Get the updated user with all relations for response
    const updatedWithRelations = (await getUser(db, userEntityWithRelations, [
      eq(user.id, params.id as string)
    ])) as UserRaw;

    if (!updatedWithRelations) {
      return error(500, 'Failed to retrieve updated user');
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      updatedWithRelations,
      updatedWithRelations.userLayers || updatedLayers,
      updatedWithRelations.userFeatures || updatedFeatures,
      false,
      sessionUser!.superAdmin
    );

    // HTTP : 200 JSON or 400
    return JSONResponseOrError(data);
  } catch (err) {
    logZodError(err, 'User update error:');
    return error(500, 'Dust Accumulation Critical');
  }
};
