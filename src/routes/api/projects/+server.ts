import { error, type RequestHandler } from '@sveltejs/kit';
import { getSessionOrThrow, JSONResponseOrThrow } from '$lib/api';
import client from '$lib/db';

export const GET: RequestHandler = async ({ locals, platform }) => {
  // AUTH : Pass or Fail
  await getSessionOrThrow(locals);
  // DB : Connect to D1
  const db = client(platform?.env.DB);
  try {
    // DB : Build & Execute Query
    const result = await db.query.geoProject.findMany();
    // HTTP : 200 JSON or 404
    return JSONResponseOrThrow(result);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    throw error(500, 'Dust Accumulation Critical');
  }
};
