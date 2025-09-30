// SVELTE
import { error, json } from '@sveltejs/kit';
// DRIZZLE
import { eq } from 'drizzle-orm';
// FORMS
import { superValidate } from 'sveltekit-superforms';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { FeatureUpdateAPI } from '$lib/db/zod/schema/feature';
// I18N
import { m } from '$lib/i18n';
// API
import {
  getDatabase,
  getPrisms,
  logZodError,
  SuperFormResponse,
  SuperFormErrorResponse,
  JSONResponseOrError,
  isAdminRequest
} from '$lib/api';
import {
  assertPermissionsToUpdateFeature,
  getFeatureQueryContext,
  featureEntityWithRelations
} from '$lib/api/services/feature';
// SCHEMA
import { feature } from '$lib/db/schema/index';
// DB
import {
  getFeature,
  getFeatureWithImage,
  updateFeatureWithRelated,
  toFormShape,
  updateFeature,
  buildResponseShape
} from '$lib/db/services/feature';
import { publishAllImagesWithPublicIntent } from '$lib/db/services/image';

// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms';
import type {
  Feature,
  FeatureDB,
  FeatureDBRaw,
  FeatureNew,
  FeaturePartial,
  Id,
  FeatureI18nDB,
  FeaturePropertyDB
} from '$lib/types';

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'feature';
const RESOURCE_PATH = 'features';

/********************
 *  READ
 ************/

/**
 * Reads a feature
 */
export const GET: RequestHandler = async ({
  params,
  locals,
  platform,
  url,
  request
}) => {
  // ASSERT : User logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);

  // CONTEXT : Get the query context
  const { conditions } = getFeatureQueryContext(
    db,
    user,
    request,
    {},
    userRoles,
    getPrisms(url)
  );

  // Add the specific feature ID condition
  conditions.push(eq(feature.id, params.id as Id));

  // FILTER : Determine if we should filter unpublished images (for public requests)
  const shouldFilterUnpublishedImages = !isAdminRequest(request);

  try {
    const result = (await getFeatureWithImage(
      db,
      featureEntityWithRelations,
      conditions,
      locals.hub
    )) as FeatureDBRaw;

    if (!result) {
      return error(404, 'Feature not found or access denied');
    }

    // RESPONSE : Build the response shape with merged properties
    const data = await buildResponseShape(
      db,
      result,
      locals.hub,
      shouldFilterUnpublishedImages
    );
    return JSONResponseOrError(data);
  } catch (e) {
    logZodError(e, 'Feature read error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  UPDATE :: REPLACE
 ************/

/**
 * Updates a feature
 */
export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);

  try {
    // ASSERT : Valid form
    const formData: Feature = await request.json();
    const form = (await superValidate(
      formData,
      // @ts-ignore TODO - Fix Zod type error
      zod(FeatureUpdateAPI)
    )) as SuperValidated<Feature>;

    // RETURN : early if the form is not valid
    if (!form.valid) return SuperFormResponse<Feature>(form);

    // ACCESS CONTROL : Check permissions
    await assertPermissionsToUpdateFeature(
      db,
      user,
      request,
      locals,
      form.data as FeatureNew,
      userRoles,
      params.id as Id
    );

    // DB : Update the feature
    const updatedFeature: FeatureDBRaw = await updateFeatureWithRelated(
      db,
      form.data as FeaturePartial,
      params.id as Id
    );

    const responseForm = await toFormShape(
      updatedFeature,
      (updatedFeature as FeatureDBRaw).i18n as FeatureI18nDB[],
      (updatedFeature as FeatureDBRaw).properties as FeaturePropertyDB[]
    );

    return SuperFormResponse<Feature>(responseForm, false, false, RESOURCE_PATH, 200);
  } catch (err) {
    logZodError(err, 'Feature update error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'update');
  }
};

/********************
 *  UPDATE :: PATCH
 ************/

/**
 * Partially updates a feature - only the fields that are provided in the request body. This endpoint is used for updating fields that don't require a full form submission, such as the feature publish or archive status.
 */
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  if (!params.id) return error(400, m.deft_sleek_wasp_dine_feature());
  const { db, user, userRoles } = await getDatabase(locals, platform);
  try {
    // ASSERT : Valid form data
    const newData: FeaturePartial = await request.json();

    // STATE : Get the existing feature to verify access
    const conditions = [eq(feature.id, params.id as string)];
    const existing = (await getFeature(db, {}, conditions, locals.hub)) as FeatureDB;

    if (!existing) return error(404, m.quiet_soft_mole_animate_feature());

    // ASSERT : Use assertion functions for access control
    await assertPermissionsToUpdateFeature(
      db,
      user,
      request,
      locals,
      existing as FeatureNew,
      userRoles,
      params.id as Id
    );

    // DB : Update only the basic feature fields (no relations for PATCH)
    await updateFeature(db, newData, params.id);

    // PUBLISH : If feature is being published, publish all images with public intent
    if (newData.isPublished === true) {
      await publishAllImagesWithPublicIntent(db, params.id as Id, user.id as Id);
    }

    // DB : Get the updated feature with all relations for response
    const updatedWithRelations = (await getFeatureWithImage(
      db,
      featureEntityWithRelations,
      [eq(feature.id, params.id as string)],
      locals.hub
    )) as FeatureDBRaw;

    if (!updatedWithRelations) {
      return error(500, 'Failed to retrieve updated feature');
    }

    // FILTER : Determine if we should filter unpublished images (for public requests)
    const shouldFilterUnpublishedImages = !isAdminRequest(request);

    // RESPONSE : Build the response shape with merged properties
    const data = await buildResponseShape(
      db,
      updatedWithRelations,
      locals.hub,
      shouldFilterUnpublishedImages
    );

    return json({ type: 'success', data });
  } catch (err) {
    logZodError(err, 'Update error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'patch');
  }
};

/********************
 *  DELETE
 ************/

// TODO Add delete feature endpoint.
//      Remember that if it is set to isArchived, it should also set the featureImages to isPublished = false, and likely set the associated images to isArchived = true too unless we've since implemented reusing images for other features.
