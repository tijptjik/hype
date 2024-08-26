import { error, type RequestHandler } from '@sveltejs/kit';
import { getSessionOrThrow, JSONResponseOrThrow } from '$lib/api';
import { migrateToLatest } from '$lib/migrate';

// export default {
export const GET: RequestHandler = async ({ locals }) => {
	// AUTH : Pass or Fail
	await getSessionOrThrow(locals)
	try {
		// DB : Migrate to latest schema
		const result = await migrateToLatest({ glob: 'migrations/*.js' })
		console.log(result);
		return JSONResponseOrThrow(result)
	} catch (e) {
		// DB : Query Error
		console.error('Database migration error:', e);
		throw error(500, 'Internal Spaghetti Constriction');
	}
};