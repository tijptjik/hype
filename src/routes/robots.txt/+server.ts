// SVELTEKIT
import type { RequestHandler } from '@sveltejs/kit'

/**
 * Returns robots directives pointing crawlers to the current host's sitemap.
 *
 * @param event - SvelteKit request event containing the request URL.
 * @returns Plain-text robots directives for the request origin.
 * @remarks This must remain a dynamic route rather than a static asset because
 * hubs and custom domains each need their own qualified sitemap URL.
 */
export const GET: RequestHandler = ({ url }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
