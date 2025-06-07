// /src/hooks.server.ts
import { handle as inject_auth } from '$lib/auth';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';

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

// const handle_security = (async ({ event, resolve }) => {
//   const response = await resolve(event);
//   response.headers.set('X-Content-Type-Options', 'nosniff');
//   response.headers.set('X-Frame-Options', 'SAMEORIGIN');
//   response.headers.set('X-XSS-Protection', '1; mode=block');
//   return response;
// }) satisfies Handle;

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
// MAIN HOOK
// ═══════════════════════
/**
 * This is the main hook that is used to sequence the other hooks.
 */
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

  handle = sequence(
    mock_cloudflare,
    handle_cors,
    // handle_security,
    handle_hub,
    inject_auth,
    translation
  );
} else {
  // handle = sequence(handle_cors, handle_security, inject_auth, translation);
  handle = sequence(handle_hub, inject_auth, translation);
}

export { handle };
