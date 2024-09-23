import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { type RequestHandler } from '@sveltejs/kit';
import { selectOrganisationSchema } from '$lib/db/schema';
import { getSessionOrError, JSONResponseOrError } from '$lib/api';
import client from '$lib/db';

export const GET: RequestHandler = async ({ locals, platform }) => {
  // AUTH : Pass or Fail
  await getSessionOrError(locals);
  // DB : Connect to D1
  const db = client(platform?.env.DB);
  try {
    // DB : Build & Execute Query
    const result = await db.query.organisation.findFirst({
      with: {
        translations: true
      }
    });
    console.debug(result);

    // HTTP : 200 JSON or 404
    const form = await superValidate(result, zod(selectOrganisationSchema));

    // Always return { form }
    return JSONResponseOrError({ form: form });
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    throw error(500, 'Dust Accumulation Critical');
  }
};
