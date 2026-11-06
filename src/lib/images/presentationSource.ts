/**
 * Restricts analysis to public image delivery paths on the application's asset hosts.
 * @param source - Requested public image URL.
 * @param appOrigin - Current application origin, used to restrict local hosts.
 * @param configured - Explicit public asset bases configured for this application.
 * @returns Validated upstream URL, or null without making a network request.
 */
export function resolvePresentationSource(
  source: string | null,
  appOrigin: string,
  configured: string[] = [],
): URL | null {
  if (!source || source.length > 4096) return null
  try {
    const url = new URL(source)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const local =
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(appOrigin).hostname) ||
      new URL(appOrigin).hostname.endsWith('.localhost')
    const bases = [
      'https://assets.hype.hk',
      'https://assets.preview.hype.hk',
      ...configured.filter(Boolean),
    ]
    if (local) bases.push('http://assets.hype.localhost')
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !bases.some(base => new URL(base).origin === url.origin)
    )
      return null
    if (!/^\/(?:production\/|preview\/)?image\/(?:upload\/|raw\/)/.test(url.pathname))
      return null
    if (/%(?:2f|5c|2e)/i.test(url.pathname) || url.pathname.includes('\\')) return null
    return url
  } catch {
    return null
  }
}
