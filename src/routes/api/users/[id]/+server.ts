// SVELTEKIT
import { error, type RequestHandler } from '@sveltejs/kit';
// DRIZZLE
import { eq } from 'drizzle-orm';
// DB
import { user } from '$lib/db/schema';
import {
  getUser,
  updateUser,
  toResponseShape,
  updateUserFeatures,
  updateUserLayers
} from '$lib/db/services/user';
// API
import { JSONResponseOrError, getDatabase, logZodError } from '$lib/api';
import {
  getUserQueryContext,
  userEntityWithRelations,
  assertPermissionsToUpdateUser
} from '$lib/api/services/user';
// TYPES
import type { UserPartial, UserDB, UserRaw, Id } from '$lib/types';

/********************
 *  READ
 ************/

/**
 * Reads a user by ID
 */
export const GET: RequestHandler = async ({ params, locals, platform, request }) => {
  // ASSERT : User logged in
  const { db, session, userRoles } = await getDatabase(locals, platform);

  // CONTEXT : Get the query context - this applies filters based on the user's permissions and the query parameters.
  let { conditions } = getUserQueryContext(session, request, {}, userRoles);

  try {
    // Add condition for specific user ID
    conditions.push(eq(user.id, params.id!));

    // DB : Get the user
    const result = (await getUser(db, userEntityWithRelations, conditions)) as UserRaw;

    if (!result) {
      return error(404, 'User not found or access denied');
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      result,
      result.userLayers || [],
      result.userFeatures || []
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'User read error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  UPDATE :: PATCH
 ************/

/**
 * Partially updates a user
 */
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, session, userRoles } = await getDatabase(locals, platform);

  try {
    // ASSERT : Valid form data
    const newData: UserPartial = await request.json();

    // Get the existing user to verify access
    const existing = (await getUser(db, {}, [
      eq(user.id, params.id as string)
    ])) as UserDB;

    if (!existing) return error(404, 'User not found');

    // ASSERT : Permissions to update user
    assertPermissionsToUpdateUser(session, existing, params.id as Id);

    // DB : Update the userBase (no relations for PATCH)
    const updated = await updateUser(db, newData, params.id as string);

    // DB : Update the userFeatures
    if (newData.userFeatures) {
      await updateUserFeatures(db, newData.userFeatures, params.id as string);
    }

    // DB : Update the userLayers
    if (newData.userLayers) {
      await updateUserLayers(db, newData.userLayers, params.id as string);
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(updated);

    // HTTP : 200 JSON or 400
    return JSONResponseOrError(data);
  } catch (err) {
    logZodError(err, 'User update error:');
    return error(500, 'Dust Accumulation Critical');
  }
};
