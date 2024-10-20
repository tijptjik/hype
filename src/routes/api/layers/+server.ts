import { error, type RequestHandler } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { projectRole, layerI18n } from '$lib/db/schema';
import { genericIndexQuery } from '$lib/db';

const RESOURCE_TYPE = 'layer';
const ACCESS_STRATEGY = 'ResourceOwnChildren';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
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
      accessStrategy,
      {
        translations: true
      },
      userId,
      projectRole,
      layerI18n,
      {
        organisation: url.searchParams.getAll('organisation'),
        project: url.searchParams.getAll('project')
      },
      3
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