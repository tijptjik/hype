// SVELTE
import { error, json } from '@sveltejs/kit';
// DRIZZLE
import { eq } from 'drizzle-orm';
// FORMS
import { superValidate } from 'sveltekit-superforms';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { FeatureUpdateAPI } from '$lib/db/zod/schemas/feature';
// I18N
import { m } from '$lib/i18n';
// API
import {
  getDatabase,
  getPrisms,
  logZodError,
  SuperFormResponse,
  SuperFormErrorResponse,
  JSONResponseOrError
} from '$lib/api';
import {
  assertPermissionsToUpdateFeature,
  getFeatureQueryContext,
  featureEntityWithRelations
} from '$lib/api/services/feature';
// SCHEMA
import { feature } from '$lib/db/schema';
// DB
import {
  getFeature,
  getFeatureWithImage,
  updateFeatureWithRelated,
  toFormShape,
  updateFeature,
  buildResponseShape
} from '$lib/db/services/feature';

// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms';
import type { Feature, FeatureDB, FeatureDBRaw, FeatureNew, FeaturePartial, Id } from '$lib/types';

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
  const { db, session, userRoles } = await getDatabase(locals, platform);

  // CONTEXT : Get the query context
  let { conditions } = getFeatureQueryContext(
    db,
    session,
    request,
    {},
    userRoles,
    getPrisms(url)
  );

  // Add the specific feature ID condition
  conditions.push(eq(feature.id, params.id as Id));

  try {
    const result = (await getFeatureWithImage(
      db,
      featureEntityWithRelations,
      conditions
    )) as FeatureDBRaw;

    if (!result) {
      return error(404, 'Feature not found or access denied');
    }

    // RESPONSE : Build the response shape with merged properties
    const data = await buildResponseShape(db, result);
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
 * Updates a layer
 */
export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, session, userRoles } = await getDatabase(locals, platform);

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
    await assertPermissionsToUpdateFeature(db, session, request, form.data as FeatureNew, userRoles);

    // DB : Update the feature
    const updatedFeature = await updateFeatureWithRelated(db, form.data as FeaturePartial, params.id as Id);

    const responseForm = await toFormShape(
      updatedFeature,
      updatedFeature.i18n,
      updatedFeature.properties
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
  const { db, session, userRoles } = await getDatabase(locals, platform);
  try {
    // ASSERT : Valid form data
    const newData: FeaturePartial = await request.json();

    // STATE : Get the existing feature to verify access
    const existing = (await getFeature(db, {}, [
      eq(feature.id, params.id as string)
    ])) as FeatureDB;

    if (!existing) return error(404, m.quiet_soft_mole_animate_feature());

    // ASSERT : Use assertion functions for access control
    assertPermissionsToUpdateFeature(db, session, request, existing as FeatureNew, userRoles);

    // DB : Update only the basic feature fields (no relations for PATCH)
    const updated = await updateFeature(db, newData, params.id);

    // RESPONSE : Return the updated feature
    return json({ type: 'success', data: updated });
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