// SVELTE
import { error } from '@sveltejs/kit';
// API
import {
  JSONResponseOrError,
  getDatabase,
  logZodError
} from '$lib/api';
import {
  assertPermissionsToListUserFeature,
  assertPermissionsToUpdateUserFeature,
  toResponseShape
} from '$lib/api/services/userFeature';
// DB
import { UserFeatureUpdateAPI } from '$lib/db/zod';
import { listUserFeatures, upsertUserFeature } from '$lib/db/services/userFeature';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';

/********************
 *  LIST
 ************/

/**
 * Lists projects
 */
export const GET: RequestHandler = async ({ url, locals, platform }) => {
  // ASSERT : User ID is provided in the query parameters
  const userIdFromParams = url.searchParams.get('userId');
  if (!userIdFromParams) {
    return error(400, 'User ID is required in query parameters');
  }
  // ASSERT : User Logged in
  const { user, db } = await getDatabase(locals, platform);
  // ASSERT : Permissions to update project
  assertPermissionsToListUserFeature(user, userIdFromParams);

  try {
    // DB : List the user features
    // Note : unlike other API end-points we are ignoring conditions here, as
    // the userId == userFeature.userId constraint is enforced in listUserFeatures
    const result = await listUserFeatures(db, userIdFromParams);

    // RESPONSE : Build the response shape
    const data = toResponseShape(result);

    // HTTP: 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB: Query Error
    console.error('Database query error retrieving user features:', e);
    // HTTP: 500 Error
    return error(500, 'Failed to retrieve user features');
  }
};

/********************
 *  UPSERT
 ************/

/**
 * Upsert a user feature
 */
export const PUT: RequestHandler = async ({ request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, userId, user } = await getDatabase(locals, platform);

  try {
    // VALIDATION: Parse and validate request body
    const body = await request.json();
    const validatedData = UserFeatureUpdateAPI.parse(body);

    if (!validatedData.userId) {
      return error(400, 'Target User ID is required in request body');
    }

    // ASSERT : Permissions to update user feature
    assertPermissionsToUpdateUserFeature(user, validatedData.userId);

    // DB: Upsert user feature
    const result = await upsertUserFeature(
      db,
      userId, 
      validatedData
    );

    // HTTP: 200 JSON or error
    return JSONResponseOrError(result);
  } catch (e: any) {
    logZodError(e, 'User feature update error:');
    // HTTP: 500 Error
    return error(500, 'Failed to update user feature');
  }
};
