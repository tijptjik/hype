/**
 * Keeps development hub emulation consistent across a page and its data requests.
 * @param url Current request URL.
 * @param referer Browser document URL, when supplied.
 * @param development Whether development-only hub overrides are enabled.
 * @returns Explicit hub override, or the same-origin document's override for data requests.
 * @remarks Never changes production routing or carries a previous page's hub into navigation.
 */
export function getDevelopmentHubOverride(
  url: URL,
  referer: string | null,
  development: boolean,
): string | undefined {
  if (!development) return undefined
  const explicit = url.searchParams.get('hub')
  if (explicit) return explicit
  if (
    !referer ||
    (!url.pathname.startsWith('/_app/remote/') && !url.pathname.startsWith('/api/'))
  )
    return undefined
  try {
    const document = new URL(referer)
    return document.origin === url.origin
      ? document.searchParams.get('hub') || undefined
      : undefined
  } catch {
    return undefined
  }
}
