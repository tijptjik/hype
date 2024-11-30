import { error, json } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { image, featureImage } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from '@sveltejs/kit';
import {
  checkProjectAccessForImage,
  checkOrganisationAccessForImage,
  checkFeatureAccessForImage
} from '$lib/db/services/image';
import { genericEntityQuery } from '$lib/db';
import type { AccessStrategyOption, Id, StatefulAccessOption } from '$lib/types';
import type { ResourceType } from '$lib/types';

const RESOURCE_TYPE: ResourceType = 'image';
const RESOURCE_PATH = 'images';
const ACCESS_STRATEGY: AccessStrategyOption = 'EntityFromEditableProject';
const PRIVILEGED_STRATEGY: StatefulAccessOption = 'EntityAny';
const PUBLIC_IDENTIFIER = 'id';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    'EntityAny',
    RESOURCE_TYPE
  );

  try {
    const result = await genericEntityQuery(
      db,
      params[PUBLIC_IDENTIFIER] as string,
      image,
      PUBLIC_IDENTIFIER,
      accessStrategy,
      {
        featureImage: true,
        contributor: true
      },
      userId
    );

    return JSONResponseOrError(result);
  } catch (e) {
    console.error('Database query error:', e);
    return error(500, 'Dust Accumulation Critical');
  }
};

export const DELETE: RequestHandler = async ({
  params,
  request,
  locals,
  platform,
  fetch: eventFetch
}) => {
  const body = await request.json();

  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE,
    params.id,
    checkFeatureAccessForImage,
    checkProjectAccessForImage,
    checkOrganisationAccessForImage,
    PRIVILEGED_STRATEGY,
    body.refType
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
    .where(eq(image.id, params[PUBLIC_IDENTIFIER] as Id))
    .limit(1);

  if (!imageToDelete) {
    error(404, 'Image not found');
  }

  try {
    // Delete from Cloudinary first
    const signResponse = await eventFetch('/api/cloudinary', {
      method: 'POST',
      body: JSON.stringify({
        paramsToSign: {
          public_id: imageToDelete.publicId
        }
      })
    });
    const signData = await signResponse.json();

    // Convert parameters to URLSearchParams
    const cloudinaryParams = new URLSearchParams({
      public_id: imageToDelete.publicId,
      api_key: signData.apikey,
      timestamp: signData.timestamp.toString(),
      signature: signData.signature
    });

    const destroyResponse = await eventFetch(
      `https://api.cloudinary.com/v1_1/${signData.cloudname}/image/destroy?${cloudinaryParams.toString()}`,
      {
        method: 'GET'
        // No body needed for GET request
      }
    );

    if (!destroyResponse.ok) {
      error(
        500,
        `Failed to delete image from Cloudinary: ${await destroyResponse.text()}`
      );
    }

    // Then delete from database
    // await db.delete(featureImage).where(eq(featureImage.imageId, params.id));
    await db.delete(image).where(eq(image.id, params[PUBLIC_IDENTIFIER] as Id));

    return json({ success: true });
  } catch (err) {
    console.error('Failed to delete image:', err);
    return error(500, 'Failed to delete image');
  }
};

export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
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

  const body = await request.json();

  try {
    if (body.featureImage) {
      await db
        .update(featureImage)
        .set(body.featureImage)
        .where(eq(featureImage.imageId, params[PUBLIC_IDENTIFIER] as Id));
    }
    return json({ success: true });
  } catch (err) {
    console.error('Failed to update image:', err);
    return error(500, 'Failed to update image');
  }
};
