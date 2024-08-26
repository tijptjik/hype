// /src/hooks.server.ts
import { handle as inject_auth } from './auth';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';

let handle: Handle;
const localWranglerEnv = import.meta.env.VITE_WRANGLER_ENV === 'local';

if (localWranglerEnv) {
  // This is an ugly hack to avoid Vite loading in the wrangler dep regardless
  // of the conditional import, and throwing errors when buidling for CF workers
  // as wrangler itself has node requirements :doh:
  const wrangler = 'wrangler';
  // When developing, this hook will add proxy objects to the `platform` object
  // which will emulate any bindings defined in `wrangler.toml`.
  const { getPlatformProxy } = await import(wrangler);
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

  // console.log('Platform initialised for local development', platform);
  handle = sequence(mock_cloudflare, inject_auth);
} else {
  handle = inject_auth;
}

export { handle };
