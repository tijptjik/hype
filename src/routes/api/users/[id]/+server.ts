import { error, type RequestHandler } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { genericEntityQuery } from '$lib/db';
import { user } from '$lib/db/schema';

const RESOURCE_TYPE = 'user';
const ACCESS_STRATEGY = 'EntityAny';
const PUBLIC_IDENTIFIER = 'id';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const result = await genericEntityQuery(
      db,
      params[PUBLIC_IDENTIFIER] as string,
      user,
      PUBLIC_IDENTIFIER,
      accessStrategy,
      {
        memberships: true,
        projectRoles: true
      },
      undefined,
      undefined,
      {
        email: false,
        emailVerified: false,
        createdAt: false,
        modifiedAt: false
      }
    );

    return JSONResponseOrError(result);
  } catch (e) {
    console.error('Database query error:', e);
    return error(500, 'Dust Accumulation Critical');
  }
}; 