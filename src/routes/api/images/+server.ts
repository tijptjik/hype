import { error, json } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';

import { image, featureImage } from '$lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import type { RequestHandler } from '@sveltejs/kit';

const RESOURCE_TYPE = 'image';
const RESOURCE_PATH = 'images';
const ACCESS_STRATEGY = 'Published';

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
      featureId
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
          // Only show unpublished images to project maintainers
          or(
            eq(featureImage.isPublished, true),
            accessStrategy === 'SuperAdmin',
            accessStrategy === 'ResourceAll'
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
