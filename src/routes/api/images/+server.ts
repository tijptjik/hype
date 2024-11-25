import { error, json } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { image, featureImage } from '$lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import type { RequestHandler } from '@sveltejs/kit';
import {
  createImage,
  extractEntitiesToInsert,
  createFeatureImage,
  checkProjectAccessForFeature,
  getImagesForFeature,
  getImageForProject,
  getImageForOrganisation
} from '$lib/db/services/image';
import type { NewImage, Image, NewImageAPI } from '$lib/types';
import { patchProject } from '$lib/db/services/project';
import { patchOrganisation } from '$lib/db/services/organisation';

const RESOURCE_TYPE = 'image';
const ACCESS_STRATEGY = 'ResourceFromEditableProject';
const PRIVILEGED_STRATEGY = 'ResourceAll';

export const GET: RequestHandler = async ({ url, locals, platform }) => {
  try {
    const organisationId = url.searchParams.get('organisationId');
    const projectId = url.searchParams.get('projectId');
    const featureId = url.searchParams.get('featureId');

    if (!featureId && !organisationId && !projectId) {
      error(400, 'Loosey goosey! A featureId, organisationId or projectId is required');
    }

    // AUTH : Pass or Fail - now includes feature access check
    const { db, userId, accessStrategy } = featureId
      ? await getDatabaseOrError(
          locals,
          platform,
          ACCESS_STRATEGY,
          RESOURCE_TYPE,
          featureId,
          checkProjectAccessForFeature,
          undefined,
          PRIVILEGED_STRATEGY
        )
      : await getDatabaseOrError(locals, platform, PRIVILEGED_STRATEGY, RESOURCE_TYPE);

    let images;
    if (featureId) {
      // Query images with publication status filter based on access
      images = await getImagesForFeature(
        db,
        featureId,
        accessStrategy,
        PRIVILEGED_STRATEGY
      );
    } else if (projectId) {
      images = await getImageForProject(db, projectId);
    } else if (organisationId) {
      images = await getImageForOrganisation(db, organisationId);
    }

    return JSONResponseOrError(images);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  const formData: NewImageAPI = await request.json();
  if (!formData.refType || !formData.refId) {
    error(400, 'Feature, Project or Organisation -- there is no try');
  }
  try {
    if (formData.refType === 'feature') {
      let featureId = formData.featureImage?.featureId;
      if (!featureId) {
        error(400, 'Give me FeatureId, or give me death');
      }

      // AUTH : Pass or Fail
      const { db, userId, accessStrategy } = await getDatabaseOrError(
        locals,
        platform,
        ACCESS_STRATEGY,
        RESOURCE_TYPE,
        featureId,
        checkProjectAccessForFeature,
        undefined,
        PRIVILEGED_STRATEGY
      );

      // Add contributor ID if not provided
      if (!formData.contributorId) {
        formData.contributorId = userId;
      }

      if (accessStrategy !== PRIVILEGED_STRATEGY) {
        // Public user uploads should use the /api/tasks endpoint
        error(403, 'Fat cat says no');
      }

      const { baseImage, relatedFeatureImage } = extractEntitiesToInsert(formData);

      const createdImage = await createImage(db, baseImage);
      const createdFeatureImage = await createFeatureImage(
        db,
        relatedFeatureImage,
        createdImage.id
      );

      return json(
        {
          ...createdImage,
          intent: createdFeatureImage.intent,
          isPublished: createdFeatureImage.isPublished,
          publishedAt: createdFeatureImage.publishedAt
        },
        { status: 201 }
      );
    }

    // AUTH : Pass or Fail
    const { db, userId, accessStrategy } = await getDatabaseOrError(
      locals,
      platform,
      PRIVILEGED_STRATEGY,
      RESOURCE_TYPE
    );

    // Add contributor ID if not provided
    if (!formData.contributorId) {
      formData.contributorId = userId;
    }

    const { baseImage } = extractEntitiesToInsert(formData);
    const createdImage = await createImage(db, baseImage);
    let updatedOwner;

    if (formData.refType === 'project') {
      updatedOwner = await patchProject(
        db,
        formData.refId,
        {
          imageId: createdImage.id
        },
        'id'
      );
    } else if (formData.refType === 'organisation') {
      updatedOwner = await patchOrganisation(
        db,
        formData.refId,
        {
          imageId: createdImage.id
        },
        'id'
      );
    }
    return json({ ...createdImage, owner: updatedOwner }, { status: 201 });
  } catch (err) {
    console.error('Failed to create image:', err);
    return error(500, 'Failed to create image');
  }
};
