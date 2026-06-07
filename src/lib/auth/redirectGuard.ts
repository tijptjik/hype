/**
 * Returns whether a pathname should stay reachable without an authenticated session.
 *
 * @param pathname - The request pathname from the incoming URL.
 * @returns `true` when the auth redirect hook must skip redirecting the request.
 * @remarks Legal policy pages must remain directly shareable for logged-out users.
 */
export function isPublicUnauthenticatedPath(
  pathname: string | null | undefined,
): boolean {
  const safePathname = pathname || ''

  return (
    safePathname.startsWith('/api/') ||
    safePathname.startsWith('/headless/') ||
    safePathname.startsWith('/proxy/') ||
    safePathname.startsWith('/static/') ||
    safePathname.startsWith('/policy/') ||
    safePathname === '/' ||
    safePathname === '' ||
    safePathname === '/manifest.webmanifest'
  )
}
