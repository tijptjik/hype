// place files you want to import through the `$lib` alias in this folder.
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Check whether the code is being run by a Cloudflare worker
 */
export const on_cloudflare = (event : RequestEvent) => {
	return event.platform?.env.CF_PAGES === 'true'
}