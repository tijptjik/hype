import { error, type RequestHandler } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { projectRole } from '$lib/db/schema';
import { hierarchicalResourceQuery } from '$lib/db';

const RESOURCE_TYPE = 'feature';
const ACCESS_STRATEGY = 'ResourceOwnGrandChildren';

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
    const result = await hierarchicalResourceQuery(
      db,
      accessStrategy,
      {},
      userId,
      projectRole,
      false,
      {
        organisation: url.searchParams.getAll('organisation'),
        project: url.searchParams.getAll('project'),
        layer: url.searchParams.getAll('layer')
      },
      4
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
