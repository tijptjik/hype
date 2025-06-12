import { error, type RequestHandler } from '@sveltejs/kit';
import { JSONResponseOrError } from '$lib/api';

function maskPrivateValues(obj: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key in obj) {
    if (
      key.startsWith('PRIVATE_') ||
      key.startsWith('SECRET_') ||
      key.endsWith('_TOKEN') ||
      key.endsWith('_KEY') ||
      key.endsWith('_SECRET')
    ) {
      result[key] = '***';
    } else {
      result[key] = obj[key];
    }
  }
  return result;
}

// @ts-ignore
export const GET: RequestHandler = async ({ locals, platform: { env } }) => {
  // HTTP : 200 JSON or 404
  const vars =
    import.meta.env.VITE_WRANGLER_ENV === 'local' ? process.env : import.meta.env;
  try {
    // HTTP : 200 JSON or 404
    return JSONResponseOrError({
      // @ts-ignore
      env: maskPrivateValues(vars),
      env_platform: Object.keys(env),
      locals: locals,
    });
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    throw error(500, 'Eternal Unhappiness Error');
  }
};
