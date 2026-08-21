// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTE DISCOVERY
// - toSitemapPath
// - getSitemapPaths
//
// 2. XML RENDERING
// - escapeXml
// - renderSitemap
// ---

const ROUTE_FILE_PREFIX = '/src/routes/'
const PAGE_FILE_SUFFIX = '/+page.svelte'

const NON_INDEXABLE_PATHS = new Set([
  '/account/reset-password',
  '/features/new',
  '/screensaver',
  '/signin',
  '/signup',
])

const NON_INDEXABLE_PREFIXES = ['/admin', '/headless'] as const

/**
 * Converts a SvelteKit page module path into a public sitemap path.
 *
 * @param routeFile - Vite's route-module path for a `+page.svelte` file.
 * @returns A static public pathname, or `null` when the route is not sitemap-safe.
 * @remarks Parameterised routes are omitted because a route module does not
 * provide the public identifiers needed to create valid URLs for them.
 */
export function toSitemapPath(routeFile: string): string | null {
  if (
    !routeFile.startsWith(ROUTE_FILE_PREFIX) ||
    !routeFile.endsWith(PAGE_FILE_SUFFIX)
  ) {
    return null
  }

  const routeSegments = routeFile
    .slice(ROUTE_FILE_PREFIX.length, -PAGE_FILE_SUFFIX.length)
    .split('/')
    .filter(segment => segment.length > 0 && !segment.startsWith('('))

  if (routeSegments.some(segment => segment.startsWith('['))) return null

  const pathname = `/${routeSegments.join('/')}`
  if (
    NON_INDEXABLE_PATHS.has(pathname) ||
    NON_INDEXABLE_PREFIXES.some(
      prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null
  }

  return pathname === '/' ? pathname : pathname.replace(/\/$/, '')
}

/**
 * Collects unique, sorted public paths from SvelteKit page module paths.
 *
 * @param routeFiles - Vite route-module paths to inspect.
 * @returns Sorted static paths suitable for a sitemap.
 */
export function getSitemapPaths(routeFiles: readonly string[]): string[] {
  return [
    ...new Set(
      routeFiles.map(toSitemapPath).filter((path): path is string => path !== null),
    ),
  ].sort((a, b) => a.localeCompare(b))
}

/**
 * Escapes text for safe placement inside XML element content.
 *
 * @param value - Text to escape.
 * @returns XML-escaped text.
 */
function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/**
 * Renders a sitemap document for a set of public paths.
 *
 * @param origin - Absolute origin used to qualify each sitemap URL.
 * @param paths - Public URL paths to include.
 * @returns UTF-8 XML sitemap text.
 */
export function renderSitemap(origin: string, paths: readonly string[]): string {
  const baseUrl = origin.endsWith('/') ? origin.slice(0, -1) : origin
  const urls = paths
    .map(path => new URL(path, `${baseUrl}/`).toString())
    .map(url => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ]
    .filter(Boolean)
    .join('\n')
}
