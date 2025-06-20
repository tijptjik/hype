// SVELTE
import { error } from '@sveltejs/kit';
// DB SCHEMA
import { image } from '$lib/db/schema/index';
// DB SERVICES
import {
  createImage,
  createFeatureImage,
  getImageForContextType,
  toResponseShape,
  toResponseShapeProjectOrOrganisation
} from '$lib/db/services/image';
import { updateOrganisationById } from '$lib/db/services/organisation';
import { updateProjectById } from '$lib/db/services/project';
import { getUserById } from '$lib/db/services/user';
// API SERVICES
import { JSONResponseOrError, isValidQueryParamsOrError, getDatabase } from '$lib/api';
import {
  getImageQueryContext,
  getCtxFromUrl,
  assertPermissionsToCreateImage
} from '$lib/api/services/image';
// ENUMS
import { ImageContextResource } from '$lib/enums';
// TYPES
import {
  ImageInsertWithFeatureAPI,
  ImageInsertWithProjectOrOrganisationAPI
} from '$lib/db/zod';
import type { RequestHandler } from '@sveltejs/kit';
import type { ImageNew, Id, QueryParams, FeatureImage } from '$lib/types';
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user';

/********************
 *  LIST
 ************/

/**
 * Lists images
/* Images are a second-class resources. This means that they are always addressedin the context of a first-class resource : organisation, project, feature, or task.

This means that the API for images is a bit different from the API for other resources.

Example requests to the image API are:

 * GET /api/images?organisationId=...
 * GET /api/images?projectId=... 
 * GET /api/images?featureId=...
 * GET /api/images?taskId=...
 */
export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
  // ASSERT : User Logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);

  // ASSERT : Valid query parameters
  // Validate query parameters, or return 400
  const contextParams = ['organisationId', 'projectId', 'featureId', 'taskId'];
  const queryParams = isValidQueryParamsOrError(image, url, contextParams);

  // ASSERT : Valid context parameters
  // Get the context from the URL, or return 400
  const { ctxId, ctxType } = getCtxFromUrl(url);

  // CONTEXT : Get the query context - this applies filters based on the user's permissions and the query parameters.
  const { conditions } = getImageQueryContext(
    db,
    user,
    request,
    queryParams as QueryParams,
    userRoles,
    ctxId,
    ctxType
  );
  try {
    // DB : Get the images for the context
    const images = await getImageForContextType(db, ctxType, conditions);

    return JSONResponseOrError(images);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  CREATE
 ************/

/**
 * Creates a new image
 * @remarks
 * Images are a second-class resources. This means that they are always addressed in the context of a first-class resource : organisation, project, or feature. This means that the API for images is a bit different from the API for other resources. Also note that tasks indirectly create images; this end-point is not used for tasks.
 *
 * Example requests to the image API are:
 *
 * POST /api/images
 * POST /api/images?organisationId=...
 * POST /api/images?projectId=...
 * POST /api/images?featureId=...
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user, userId, userRoles } = await getDatabase(locals, platform);
  const userWithAttribution = await getUserById(
    db,
    userId,
    userColumnsWithPrivacyProtected
  );

  try {
    // ASSERT : Valid submitted data
    const data: ImageNew = await request.json();

    // ASSERT : Contributor ID is set if not provided
    if (!data.contributorId && userId) {
      data.contributorId = userId;
    }
    // ASSERT : Context type is set
    if (!data.ctxType || !data.ctxId) {
      error(400, 'Feature, Project or Organisation -- there is no try');
    }
    if (
      !Object.values(ImageContextResource).includes(
        data.ctxType as ImageContextResource
      )
    ) {
      error(
        400,
        `Invalid context type. Was ${data.ctxType} should be one of ${Object.values(ImageContextResource).join(', ')}`
      );
    }
    // ASSERT : Feature Image is set if context type is feature
    if (data.ctxType === ImageContextResource.feature && !data.featureImage) {
      error(400, 'Feature Image is required when ctxType is feature');
    }
    // ASSERT : Feature Image is valid if context type is feature
    if (
      data.ctxType === ImageContextResource.feature &&
      !data.featureImage?.featureId
    ) {
      error(400, 'Feature Image must have a featureId when ctxType is feature');
    }
    // ASSERT : Access to context
    await assertPermissionsToCreateImage(
      db,
      user,
      request,
      locals.hub,
      data,
      userRoles,
      data.ctxType as ImageContextResource,
      data.ctxId as Id
    );
    // SWITCH : Feature Image
    if (data.ctxType === ImageContextResource.feature) {
      const validatedData = ImageInsertWithFeatureAPI.parse(data);
      // DB : Create the image
      const createdImage = await createImage(db, validatedData);
      // DB : Create the feature image
      const featureImage = {
        ...validatedData.featureImage,
        imageId: createdImage.id,
        featureId: data.ctxId
      } as FeatureImage;
      const createdFeatureImage = await createFeatureImage(
        db,
        featureImage,
        createdImage.id
      );
      const responseData = await toResponseShape(
        createdImage,
        createdFeatureImage,
        userWithAttribution?.attribution ?? undefined
      );
      // DB : Return the created
      return JSONResponseOrError(responseData);
    }

    // SWITCH : Organisation or Project Image
    if (
      data.ctxType === ImageContextResource.project ||
      data.ctxType === ImageContextResource.organisation
    ) {
      const validatedData = ImageInsertWithProjectOrOrganisationAPI.parse(data);
      // DB : Create the image
      const createdImage = await createImage(db, validatedData);
      // DB : Update the Project or Organisation
      const payload = { imageId: createdImage.id };
      if (validatedData.ctxType === ImageContextResource.project) {
        await updateProjectById(db, payload, validatedData.ctxId);
      } else if (validatedData.ctxType === ImageContextResource.organisation) {
        await updateOrganisationById(db, payload, validatedData.ctxId);
      }

      const responseData = await toResponseShapeProjectOrOrganisation(
        createdImage,
        userWithAttribution?.attribution ?? undefined
      );
      // DB : Return the created
      return JSONResponseOrError(responseData);
    }
  } catch (err) {
    console.error('Failed to create image:', err);
    return error(500, 'Failed to create image');
  }
};
