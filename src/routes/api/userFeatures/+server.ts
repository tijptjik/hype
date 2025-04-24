import { userFeature, feature, user } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { AccessStrategyOption } from '$lib/types';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { UserFeatureUpdate, UserFeatureUpdateExtended } from '$lib/db/zod';

const RESOURCE_TYPE = 'userFeature';
const ACCESS_STRATEGY = 'GenericOwn' as AccessStrategyOption;

export const GET: RequestHandler = async ({ url, locals, platform }) => {
  if (!url.searchParams.get('userId')) {
    return new Response('User ID is required', { status: 400 });
  }

  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE,
    url.searchParams.get('userId') || undefined
  );

  try {
    // DB : Build & Execute Query
    const userFeatures = await db
      .select()
      .from(userFeature)
      .where(eq(userFeature.userId, userId));

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(userFeatures);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};

export const PUT: RequestHandler = async ({ request, locals, platform }) => {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedData = UserFeatureUpdate.parse(body);

    const { db, userId } = await getDatabaseOrError(
      locals,
      platform,
      ACCESS_STRATEGY,
      RESOURCE_TYPE,
      validatedData.userId
    );

    console.log('userId', userId);
    console.log('featureId', validatedData.featureId);
    // Check if record exists
    const existingRecord = await db
      .select()
      .from(userFeature)
      .where(
        and(
          eq(userFeature.userId, userId),
          eq(userFeature.featureId, validatedData.featureId)
        )
      )
      .limit(1);

    console.log('existingRecord', existingRecord);

    let result;
    if (existingRecord.length > 0) {
      // Update existing record
      result = await db
        .update(userFeature)
        .set({
          isVisited: validatedData.isVisited,
          isWishlisted: validatedData.isWishlisted,
          visitedAt: validatedData.visitedAt
        })
        .where(
          and(
            eq(userFeature.userId, userId),
            eq(userFeature.featureId, validatedData.featureId)
          )
        )
        .returning();
    } else {
      // Create new record
      result = await db
        .insert(userFeature)
        .values({
          userId,
          featureId: validatedData.featureId,
          isVisited: validatedData.isVisited,
          isWishlisted: validatedData.isWishlisted,
          visitedAt: validatedData.visitedAt
        })
        .returning();
    }

    console.log('result', result);

    return JSONResponseOrError(result[0]);
  } catch (e) {
    console.error('Database query error:', e);
    return error(500, 'Failed to update user feature');
  }
};
