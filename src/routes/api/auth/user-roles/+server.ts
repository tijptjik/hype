// SVELTE
import { json } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
// LIB
import { getDatabase } from '$lib/api';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';

/**
 * GET fresh user roles for the current session
 */
export const GET: RequestHandler = async ({ locals, platform }) => {
  try {
    // Get database and session
    const { session, userId, userRoles } = await getDatabase(locals, platform);

    if (!session || !userId) {
      return error(401, 'Not authenticated');
    }

    // Return fresh user roles
    return json({ roles: userRoles });
  } catch (err) {
    console.error('Error fetching user roles:', err);
    return error(500, 'Failed to fetch user roles');
  }
}; 