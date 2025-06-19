// SVELTE
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
// I18N
import { paraglideMiddleware } from '$lib/paraglide/server';
// DB
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/db/schema/index';
// AUTH
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth } from '$lib/auth';
// TYPES
import type { Session, SessionUser } from '$lib/types';
import type { D1Database as MiniflareD1Database } from '@miniflare/d1';

let handle: Handle;

// ═══════════════════════
// TRANSLATION HOOK
// ═══════════════════════
/**
 * This hook is used to add the paraglide middleware to the request.
 * It is used to translate the request to the correct locale.
 */
const translation: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    event.request = localizedRequest;
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        return html.replace('%lang%', locale);
      }
    });
  });

// ═══════════════════════
// CORS HOOK
// ═══════════════════════
/**
 * This hook is used to add CORS headers to the response.
 * It is used to allow requests from other domains.
 */
const handle_cors = (async ({ event, resolve }) => {
  // Only add CORS headers in development mode
  if (import.meta.env.DEV) {
    const response = await resolve(event);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    response.headers.set('Access-Control-Allow-Headers', '*');
    return response;
  }
  return resolve(event);
}) satisfies Handle;

// ═══════════════════════
// HUB HOOK
// ═══════════════════════
/**
 * This hook is used to set the hub info in the locals object.
 * It is used to filter the data in the database.
 */
const handle_hub: Handle = async ({ event, resolve }) => {
  // Get host from headers
  const host = event.request.headers.get('host');

  // Parse hub info from domain without DB lookup
  const { getHubFromDomain } = await import('$lib/api/services/hub');

  // Get hub code from platform env for development override
  const hubCode = event.platform?.env?.PUBLIC_HUB_CODE;

  // Store hub info in locals for use throughout the app
  event.locals.hub = getHubFromDomain(host, hubCode);

  return resolve(event);
};

// ═══════════════════════
// BETTER-AUTH HOOK
// ═══════════════════════
/**
 * This hook sets up Better-Auth with the database connection
 * Better Auth's svelteKitHandler automatically handles /api/auth/* endpoints
 */
const handle_auth: Handle = async ({ event, resolve }) => {
  try {
    if (!event.platform?.env?.DB) {
      console.error('🔴 Auth: No DB available for:', event.url.pathname);
      return resolve(event);
    }

    // DB
    const db = drizzle(event.platform.env.DB as unknown as MiniflareD1Database, {
      schema
    });

    // AUTH
    const auth = createAuth(db, {
      AUTH_SECRET: event.platform.env.AUTH_SECRET,
      AUTH_GOOGLE_ID: event.platform.env.AUTH_GOOGLE_ID,
      AUTH_GOOGLE_SECRET: event.platform.env.AUTH_GOOGLE_SECRET,
      SUPERADMIN_USERID: event.platform.env.SUPERADMIN_USERID
    });

    // SET LOCALS
    event.locals.auth = auth;

    return svelteKitHandler({ event, resolve, auth });
  } catch (error) {
    console.error('🔴 Auth setup error:', error);
    return resolve(event);
  }
};

/**
 * Workaround to set session and user locals
 */
const handle_session_auth: Handle = async ({ event, resolve }) => {
  try {
    // LOCALS
    const sessionData = await event.locals.auth.api.getSession({
      headers: event.request.headers
    });

    // Safely assign session and user data
    if (sessionData && sessionData.session && sessionData.user) {
      event.locals.session = sessionData.session as Session;
      event.locals.user = sessionData.user as SessionUser;
    }
  } catch (error) {
    console.error('🔴 Session auth error:', error);
    // Don't fail the request, just leave session/user undefined
    event.locals.session = undefined;
    event.locals.user = undefined;
  }

  return resolve(event);
};

// ═══════════════════════
// HUB ENRICHMENT HOOK
// ═══════════════════════
/**
 * This hook enriches the hub info with session data after auth runs.
 * It adds the superAdmin status to the hub options.
 * Only runs for API routes since only API routes need protection
 */
const handle_hub_enrichment: Handle = async ({ event, resolve }) => {
  // Only run for API routes where auth is available
  // LOCALS
  if (event.locals.hub) {
    // Cast user to SessionUser to access superAdmin property from custom session
    const sessionUser = event.locals.user as SessionUser;
    event.locals.hub.isSuperAdmin = sessionUser?.superAdmin || false;
  }
  return resolve(event);
};

// ═══════════════════════
// MAIN HOOK
// ═══════════════════════
/**
 * This is the main hook that is used to sequence the other hooks.
 */

handle = sequence(
  handle_cors,
  handle_hub,
  handle_auth,
  handle_session_auth,
  handle_hub_enrichment,
  translation
);

export { handle };
