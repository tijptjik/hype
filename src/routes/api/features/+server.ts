// SVELTE
import { error } from '@sveltejs/kit';
// FORMS
import { superValidate } from 'sveltekit-superforms';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { FeatureInsertAPI } from '$lib/db/zod';
// API
import {
  getDatabase,
  isValidQueryParamsOrError,
  getPrisms,
  logZodError,
  SuperFormResponse,
  SuperFormErrorResponse,
  JSONResponseOrError,
  isAdminRequest
} from '$lib/api';
import {
  getFeatureQueryContext,
  featureCollectionWithRelations,
  withExpandedNeighbourhoods,
  assertPermissionsToCreateFeature
} from '$lib/api/services/feature';
// SCHEMA
import { feature } from '$lib/db/schema/index';
// SERVICES
import {
  listFeaturesWithImage,
  createFeatureWithRelated,
  toFormShape,
  buildCollectionResponseShape
} from '$lib/db/services/feature';

// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms';
import type {
  FeatureNew,
  HubOpts,
  Feature,
  QueryParams,
  FeatureDBRaw
} from '$lib/types';

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'feature';
const RESOURCE_PATH = 'features';

/********************
 *  LIST
 ************/

/**
 * Lists features
 */
export const GET: RequestHandler = async ({ locals, platform, url, request }) => {
  // ASSERT : User Logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);

  // ASSERT : Valid query parameters
  // Validate query parameters, or return 400
  const queryParams = isValidQueryParamsOrError(feature, url);

  // CONTEXT : Get the query context - this applies filters based on the user's permissions and the query parameters.
  const { conditions } = getFeatureQueryContext(
    db,
    user,
    request,
    withExpandedNeighbourhoods(queryParams as QueryParams),
    userRoles,
    getPrisms(url)
  );

  // FILTER : Determine if we should filter unpublished images (for public requests)
  const shouldFilterUnpublishedImages = !isAdminRequest(request);

  try {
    // DB : List the features
    const result = await listFeaturesWithImage(
      db,
      featureCollectionWithRelations,
      conditions,
      locals.hub as HubOpts
    );

    // RESPONSE : Build the response shape with merged properties
    const data = await buildCollectionResponseShape(
      db,
      result as FeatureDBRaw[],
      locals.hub as HubOpts,
      shouldFilterUnpublishedImages
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'Zod list error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  CREATE
 ************/

/**
 * Creates a new feature
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user, userId, userRoles } = await getDatabase(locals, platform);

  try {
    // ASSERT : Valid form
    const formData: FeatureNew = await request.json();
    // ASSERT : Contributor ID is set if not provided
    if (!formData.contributorId && userId) {
      formData.contributorId = userId;
    }

    const form = (await superValidate(
      formData,
      // @ts-ignore - FORM : Fix type error
      zod(FeatureInsertAPI)
    )) as SuperValidated<FeatureNew>;

    if (!form.valid) {
      return SuperFormResponse<any>(form);
    }

    await assertPermissionsToCreateFeature(
      db,
      user,
      request,
      locals,
      form.data as any,
      userRoles
    );

    const created = await createFeatureWithRelated(db, form.data as FeatureNew);

    const responseForm = await toFormShape(created, created.i18n, created.properties);

    return SuperFormResponse<Feature>(responseForm, true, false, RESOURCE_PATH, 201);
  } catch (err) {
    logZodError(err, 'Feature create error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'create');
  }
};
