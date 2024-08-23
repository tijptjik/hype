import { error, type RequestHandler } from '@sveltejs/kit';
import { connect } from '$lib/db';
import { getSessionOrThrow, JSONResponseOrThrow } from '$lib/api';

// export default {
export const GET: RequestHandler = async ({ locals, platform }) => {
	// AUTH : Pass or Fail
	await getSessionOrThrow(locals)
	// DB : Connect to D1
  const db = connect({platform:platform});
	try {
		// DB : Build & Execute Query
  	const result = await db.selectFrom('User').selectAll().executeTakeFirst();
		// HTTP : 200 JSON or 404
		return JSONResponseOrThrow(result)}
	catch (e) {
		// DB : Query Error
		console.error('Database query error:', e);
		throw error(500, 'Internal Server Error');
	}
};
  // async fetch(request: Request, env: Env): Promise<Response> {
  //   const { searchParams } = new URL(params.url);
  //   const action = searchParams.get('action');
  //   const key = searchParams.get('key');
  //   const value = searchParams.get('value');

    //   case 'set': {
    //     if (!(key && value)) {
    //       return new Response('Key and value must be defined.', { status: 400 });
    //     }
    //     try {
    //       await db
    //         .insertInto('kv')
    //         .values([{ key, value }])
    //         .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    //         .execute();
    //     } catch (err) {
    //       console.log(err);
    //       console.log((err as any).cause);
    //       throw err;
    //     }
    //     return new Response(value, { status: 200 });
    //   }
    //
    //   case 'delete': {
    //     if (!key) {
    //       return new Response('Key is not defined.', { status: 400 });
    //     }
    //     await db.deleteFrom('kv').where('key', '=', key).execute();
    //     return new Response('', { status: 200 });
    //   }
    // }
    //
    // return new Response(`Action must be get/set/delete`, { status: 400 });
