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
} from '$lib/db/services/image';
import type { NewImage, Image, NewImageAPI } from '$lib/types';

const RESOURCE_TYPE = 'image';
const ACCESS_STRATEGY = 'ResourceFromEditableProject';
const PRIVILEGED_STRATEGY = 'ResourceAll';

export const GET: RequestHandler = async ({ url, locals, platform }) => {
  try {
    const featureId = url.searchParams.get('featureId');

    if (!featureId) {
      error(400, 'Feature ID is required');
    }

    // AUTH : Pass or Fail - now includes feature access check
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

    // Query images with publication status filter based on access
    const images = await db
      .select({
        id: image.id,
        publicId: image.publicId,
        env: image.env,
        cdn: image.cdn,
        contributorId: image.contributorId,
        capturedAt: image.capturedAt,
        // Include featureImage fields
        intent: featureImage.intent,
        isPublished: featureImage.isPublished,
        publishedAt: featureImage.publishedAt
      })
      .from(image)
      .innerJoin(featureImage, eq(image.id, featureImage.imageId))
      .where(
        and(
          eq(featureImage.featureId, featureId),
          // Hide unpublished images from everyone except project maintainers and superadmins
          or(
            eq(featureImage.isPublished, true),
            accessStrategy === PRIVILEGED_STRATEGY
          )
        )
      );

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

  if (accessStrategy !== PRIVILEGED_STRATEGY) {
    // Public user uploads should use the /api/tasks endpoint
    error(403, 'Fat cat says no');
  }

  try {
    // Add contributor ID if not provided
    if (!formData.contributorId) {
      formData.contributorId = userId;
    }

    const { baseImage, relatedFeatureImage } = extractEntitiesToInsert(formData);

    const createdImage = await createImage(db, baseImage);
    const createdFeatureImage = await createFeatureImage(
      db,
      relatedFeatureImage,
      createdImage.id
    );

    return json({
      ...createdImage,
      intent: createdFeatureImage.intent,
      isPublished: createdFeatureImage.isPublished,
      publishedAt: createdFeatureImage.publishedAt
    }, { status: 201 });

  } catch (err) {
    console.error('Failed to create image:', err);
    return error(500, 'Failed to create image');
  }
};