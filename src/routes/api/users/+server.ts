import { error, json, type RequestHandler } from '@sveltejs/kit';
import DB from '$lib/prisma';

export const GET: RequestHandler = async ({ locals, platform }) => {
	const session = await locals.auth();
	if (!session?.user) {
		throw error(401, 'No nice, no rice');
	}
	try {
		const prisma = DB(platform?.env.DB);
		const result = await prisma.users.findMany({ take: 10 });
		return json(result);
	} catch (e) {
		console.error('Database query error:', e);
		throw error(500, 'Internal Server Error');
	}
};