// SVELTEKIT
import { error, type RequestHandler } from '@sveltejs/kit';
// DB
import { user } from '$lib/db/schema/index';
import { searchUsers, toResponseShape } from '$lib/db/services/user';
// API
import { JSONResponseOrError, getDatabase, isValidQueryParamsOrError } from '$lib/api';
import {
  getUserQueryContext,
  userCollectionWithRelations
} from '$lib/api/services/user';
import type { UserRaw } from '$lib/types';

/********************
 *  LIST
 ************/

// TODO: Restrict access to Organisation / Project Owners

/**
 * Lists users
 */
export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
  // AUTH : Pass or Fail
  // ASSERT : User Logged in
  const {
    db,
    session,
    user: sessionUser,
    userRoles
  } = await getDatabase(locals, platform);

  // ASSERT : Valid query parameters
  // Validate query parameters, or return 400
  const queryParams = isValidQueryParamsOrError(user, url) as Record<
    string,
    string | string[]
  >;
  const searchParam = url.searchParams.get('q') as string;

  // CONTEXT : Get the query context - this applies filters based on the user's permissions and the query parameters.
  const { conditions } = getUserQueryContext(
    sessionUser,
    request,
    queryParams,
    userRoles
  );

  try {
    // DB : List the organisations
    const result = await searchUsers(
      db,
      userCollectionWithRelations,
      conditions,
      searchParam
    );

    // RESPONSE : Build the response shape
    const data = await Promise.all(
      result.map(async (user) => {
        return await toResponseShape(user, [], [], true, sessionUser.superAdmin);
      })
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};
