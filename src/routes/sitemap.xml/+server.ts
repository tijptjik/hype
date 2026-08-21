// SVELTEKIT
import type { RequestHandler } from '@sveltejs/kit'
// SITEMAP
import { getSitemapPaths, renderSitemap } from '$lib/server/sitemap'

const pageRoutes = import.meta.glob('/src/routes/**/+page.svelte')
const sitemapPaths = getSitemapPaths(Object.keys(pageRoutes))

/**
 * Returns the generated sitemap for the current application origin.
 *
 * @param event - SvelteKit request event containing the request URL.
 * @returns Cached XML sitemap response.
 * @remarks Route discovery is compiled from page components so admin routes,
 * API handlers, redirects, and parameterised route templates are not emitted.
 */
export const GET: RequestHandler = ({ url }) =>
  new Response(renderSitemap(url.origin, sitemapPaths), {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
