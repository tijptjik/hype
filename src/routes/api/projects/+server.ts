import { error, type RequestHandler } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { project, projectRole, projectI18n } from '$lib/db/schema';
import { genericIndexQuery } from '$lib/db';

const RESOURCE_TYPE = 'projects';
const ACCESS_STRATEGY = 'listingOwn';

export const GET: RequestHandler = async ({ locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    // DB : Build & Execute Query
    const result = await genericIndexQuery(
      db,
      project,
      {
        translations: true,
        maintainerRoles: true
      },
      projectRole,
      projectI18n,
      'projectId',
      userId,
      accessStrategy
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
