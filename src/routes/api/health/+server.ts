import { error, type RequestHandler } from '@sveltejs/kit';
import { JSONResponseOrThrow } from '$lib/api';

function maskPrivateValues(obj: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key in obj) {
    if (key.startsWith("PRIVATE_") || key.startsWith("SECRET_") || key.endsWith("_TOKEN") || key.endsWith("_KEY")) {
      result[key] = "***";
    } else {
      result[key] = obj[key];
    }
  }
  return result;
}

// export default {
export const GET: RequestHandler = async ({ locals, platform }) => {
	// HTTP : 200 JSON or 404

	try {
		// HTTP : 200 JSON or 404
		return JSONResponseOrThrow({
			env: maskPrivateValues(process.env),
			locals: locals,
			env_platform : Object.keys(platform?.env)
		});
	} catch (e) {
		// DB : Query Error
		console.error('Database query error:', e);
		throw error(500, 'Internal Server Error');
	}
};