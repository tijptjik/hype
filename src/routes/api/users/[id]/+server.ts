import { error, type RequestHandler } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { genericEntityQuery } from '$lib/db';
import { user, userLayer } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { UserUpdateAPI } from '$lib/db/zod';
import { patchUser } from '$lib/db/services/user';

const RESOURCE_TYPE = 'user';
let ACCESS_STRATEGY = 'EntityAny';
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
      params[PUBLIC_IDENTIFIER],
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

export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  const body = await request.json();

  let ACCESS_STRATEGY = 'GenericSelf';

  // Only allow users to update their own profile
  const { db, userId } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE,
    params[PUBLIC_IDENTIFIER]
  );

  try {
    // Update user and their preferences
    const updatedUser = await patchUser(db, userId, body, 'id');

    return JSONResponseOrError(updatedUser);
  } catch (e) {
    console.error('Database update error:', e);
    if (e instanceof Error) {
      return error(400, e.message);
    }
    return error(500, 'Dust Accumulation Critical');
  }
};
