// /src/hooks.server.ts
import { handle as inject_auth }  from "./auth";
import { sequence } from "@sveltejs/kit/hooks";

import type { Handle } from '@sveltejs/kit';
import type { PlatformProxy } from 'wrangler';

// When developing, this hook will add proxy objects to the `platform` object
// which will emulate any bindings defined in `wrangler.toml`.
const dev = import.meta.env.VITE_USER_NODE_ENV === 'development';
let platform: PlatformProxy<Record<string, unknown>>;

if (dev) {
	const { getPlatformProxy } = await import('wrangler');
	platform = await getPlatformProxy();
	console.log('Platform initialised for local development', platform);
}

export const mock_cloudflare = (async ({ event, resolve }) => {
	if (dev && platform) {
		event.platform = {
			...event.platform,
			...platform
		};
	}
	return resolve(event);
}) satisfies Handle;


export const handle = sequence(mock_cloudflare, inject_auth)
