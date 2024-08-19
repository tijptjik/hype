import { error, json, type RequestHandler } from '@sveltejs/kit';
import D1DB from '$lib/prisma';

export const GET: RequestHandler = async ({ locals, platform }) => {
	const session = await locals.auth();
	if (!session?.user) {
		throw error(401, 'No nice, no rice');
	}
	try {
		const prisma = D1DB(platform?.env.DB);
		const result = await prisma.user.findMany({ take: 50 });
		return json(result);
	} catch (e) {
		console.error('Database query error:', e);
		throw error(500, 'Internal Server Error');
	}
};