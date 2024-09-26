import { error, type RequestHandler } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import {
  organisation,
  organisationRole,
  organisationI18n,
} from '$lib/db/schema';
import { genericIndexQuery } from '$lib/db';

const RESOURCE_TYPE = 'organisations';
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
      organisation,
      {
        userRoles: true,
        translations: true
      },
      organisationRole,
      organisationI18n,
      'organisationId',
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
