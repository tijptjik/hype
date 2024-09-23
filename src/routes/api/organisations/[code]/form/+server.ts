import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { error, type RequestHandler } from '@sveltejs/kit';
import { organisation, OranisationSchema } from '$lib/db/schema';
import { getSessionOrError, JSONResponseOrError } from '$lib/api';
import client from '$lib/db';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  // AUTH : Pass or Fail
  await getSessionOrError(locals);
  // DB : Connect to D1
  const db = client(platform?.env.DB);
  try {
    // DB : Build & Execute Query
    // @ts-ignore
    console.info('Searching for', params.code);
    const result = await db.query.organisation.findFirst({
      // @ts-ignore
      where: eq(organisation.code, params.code),
      with: {
        translations: true
      }
    });

    // HTTP : 200 JSON or 404
    const form = await superValidate(result, zod(OranisationSchema));

    // Always return { form }
    return JSONResponseOrError(form);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};
