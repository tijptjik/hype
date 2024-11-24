import { error, json } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { image, featureImage } from '$lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import type { RequestHandler } from '@sveltejs/kit';
import {
  createImage,
  createFeatureImage,
  extractEntitiesToInsert,
  checkProjectAccessForImage
} from '$lib/db/services/image';
import type { NewImage, Image, NewImageAPI, Id } from '$lib/types';

const RESOURCE_TYPE = 'image';
const RESOURCE_PATH = 'images';
const ACCESS_STRATEGY = 'EntityFromEditableProject';
const PRIVILEGED_STRATEGY = 'EntityAny';

export const DELETE: RequestHandler = async ({ params, locals, platform }) => {
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE,
    params.id,
    checkProjectAccessForImage,
    undefined,
    PRIVILEGED_STRATEGY
  );
  // Get image details first
  const [imageToDelete] = await db
    .select({
      id: image.id,
      publicId: image.publicId,
      featureId: featureImage.featureId
    })
    .from(image)
    .innerJoin(featureImage, eq(image.id, featureImage.imageId))
    .where(eq(image.id, params.id as Id))
    .limit(1);

  if (!imageToDelete) {
    error(404, 'Image not found');
  }

  try {

    // Delete from Cloudinary first
    const signResponse = await fetch('/api/cloudinary', {
      method: 'POST',
      body: JSON.stringify({
        paramsToSign: {
          public_id: imageToDelete.publicId,
          type: 'destroy'
        }
      })
    });
    const signData = await signResponse.json();

    const destroyResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${signData.cloudname}/image/destroy`,
      {
        method: 'POST',
        body: JSON.stringify({
          public_id: imageToDelete.publicId,
          api_key: signData.apikey,
          timestamp: signData.timestamp,
          signature: signData.signature
        })
      }
    );

    if (!destroyResponse.ok) {
      error(500, 'Failed to delete image from Cloudinary');
    }

    // Then delete from database
    await db.delete(featureImage).where(eq(featureImage.imageId, params.id));
    await db.delete(image).where(eq(image.id, params.id));

    return json({ success: true });
  } catch (err) {
    console.error('Failed to delete image:', err);
    return error(500, 'Failed to delete image');
  }
};
