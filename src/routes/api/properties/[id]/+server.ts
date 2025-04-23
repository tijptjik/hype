import { error, type RequestHandler } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
import { genericEntityQuery, hierarchicalEntityQuery } from '$lib/db';
import { projectRole, property } from '$lib/db/schema';

const RESOURCE_TYPE = 'property';
const ACCESS_STRATEGY = 'Public';
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
      property,
      PUBLIC_IDENTIFIER,
      accessStrategy,
      {
        translations: true,
        values: {
          with: {
            translations: true
          }
        }
      }
    );

    return JSONResponseOrError(result);
  } catch (e) {
    console.error('Database query error:', e);
    return error(500, 'Dust Accumulation Critical');
  }
};
