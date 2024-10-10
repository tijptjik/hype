import { error, type RequestHandler } from '@sveltejs/kit';
import {
  projectRole
} from '$lib/db/schema';
import {
  getDatabaseOrError,
  JSONResponseOrError,
  type AccessStrategyOption
} from '$lib/api';
import { genericProfileQuery } from '$lib/db';

const RESOURCE_TYPE = 'feature';
const ACCESS_STRATEGY = 'profileOwnGrandChild' as AccessStrategyOption;
const PUBLIC_IDENTIFIER = 'id';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );
  try {
    // DB : Build & Execute Query
    const result = await genericProfileQuery(
      db,
      params[PUBLIC_IDENTIFIER] as string,
      PUBLIC_IDENTIFIER,
      accessStrategy,
      {},
      userId,
      projectRole,
      false,
      4  // Depth is 4 for features (organisation -> project -> layer -> feature)
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(result);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};
