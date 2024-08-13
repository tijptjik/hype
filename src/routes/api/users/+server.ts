import { error, json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals, platform }) => {
	const session = await locals.auth();
	if (!session?.user) {
		throw error(401, 'No nice, no rice');
	}
	try {
		const result = await platform?.env.DB.prepare(
			'SELECT * FROM users LIMIT 5'
		).run();
		return json(result);
	} catch (e) {
		console.error('Database query error:', e);
		throw error(500, 'Internal Server Error');
	}
};