// /src/hooks.server.ts
import { handle as inject_auth } from '$lib/auth';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';

let handle: Handle;
const localWranglerEnv = import.meta.env.VITE_WRANGLER_ENV === 'local';

// creating a handle to use the paraglide middleware
const translation: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    event.request = localizedRequest;
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        return html.replace('%lang%', locale);
      }
    });
  });

// const handle_cors = (async ({ event, resolve }) => {
//   const response = await resolve(event);
//   response.headers.set('Access-Control-Allow-Origin', '*');
//   response.headers.set(
//     'Access-Control-Allow-Methods',
//     'GET, POST, PUT, DELETE, OPTIONS'
//   );
//   response.headers.set('Access-Control-Allow-Headers', '*');
//   return response;
// }) satisfies Handle;

// const handle_security = (async ({ event, resolve }) => {
//   const response = await resolve(event);
//   response.headers.set('X-Content-Type-Options', 'nosniff');
//   response.headers.set('X-Frame-Options', 'SAMEORIGIN');
//   response.headers.set('X-XSS-Protection', '1; mode=block');
//   return response;
// }) satisfies Handle;

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
    // handle_cors,
    // handle_security,
    inject_auth,
    translation
  );
} else {
  // handle = sequence(handle_cors, handle_security, inject_auth, translation);
  handle = sequence(inject_auth, translation);
}

export { handle };
