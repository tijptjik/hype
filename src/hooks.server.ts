// SVELTE
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
// DB
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/db/schema/index';
// AUTH
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth } from '$lib/auth';
// I18N
import { paraglideMiddleware } from '$lib/paraglide/server';
// TYPES
import type { Session, SessionUser } from '$lib/types';

let handle: Handle;
const localWranglerEnv = import.meta.env.VITE_WRANGLER_ENV === 'local';

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
  if (import.meta.env.DEV || localWranglerEnv) {
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

  // Store hub info in locals for use throughout the app
  event.locals.hub = getHubFromDomain(host);

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
    const db = drizzle(event.platform.env.DB, { schema });

    // AUTH
    const auth = createAuth(db);

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
    if (sessionData && sessionData.session && sessionData.user){
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

const common_handle_sequence = [
  handle_cors,
  handle_hub,
  handle_auth,
  handle_session_auth,
  handle_hub_enrichment,
  translation
];
if (localWranglerEnv) {
  // This is an ugly hack to avoid Vite loading in the wrangler dep regardless
  // of the conditional import, and throwing errors when building for CF workers
  // as wrangler itself has node requirements :doh:
  const wrangler = 'wrangler';
  // When developing, this hook will add proxy objects to the `platform` object
  // which will emulate any bindings defined in `wrangler.toml`.
  const { getPlatformProxy } = await import(/* @vite-ignore */ wrangler);
  const platform = await getPlatformProxy();

  const mock_cloudflare = (async ({ event, resolve }) => {
    if (platform) {
      // @ts-ignore
      event.platform = {
        ...event.platform,
        ...platform
      };
    }
    return resolve(event);
  }) satisfies Handle;

  handle = sequence(mock_cloudflare, ...common_handle_sequence);
} else {
  handle = sequence(...common_handle_sequence);
}

export { handle };
