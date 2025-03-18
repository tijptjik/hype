import { userFeature, feature, user } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { AccessStrategyOption } from '$lib/types';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';

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
