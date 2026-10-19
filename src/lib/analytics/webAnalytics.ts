// Cloudflare Web Analytics site tokens are public identifiers, not API credentials.
const WEB_ANALYTICS_SITES: Readonly<
  Record<string, { token: string; collector: string }>
> = {
  'hype.hk': {
    token: '83c62304f42740d29a10fcb3007edb35',
    collector: '/cdn-cgi/rum',
  },
  'hkghostsigns.com': {
    token: 'ef71ccbaeda247df9bcfa15d5af1a190',
    collector: 'https://cloudflareinsights.com/cdn-cgi/rum',
  },
}

/**
 * Installs the site's public Web Analytics beacon when edge injection is absent.
 * @param document - Mounted browser document.
 * @returns Whether a new beacon script was inserted.
 * @remarks Only the two production origins are tracked. Existing Cloudflare
 * injection wins, and repeated mounts never install a second beacon. The beacon
 * manages SPA navigation itself; do not emit additional page-view events here.
 */
export function installWebAnalytics(document: Document): boolean {
  const { hostname, protocol, port } = document.location
  const site = WEB_ANALYTICS_SITES[hostname]
  if (!site || protocol !== 'https:' || port) return false
  if (
    document.querySelector(
      'script[data-cf-beacon], script[src*="static.cloudflareinsights.com/beacon.min.js"]',
    )
  )
    return false

  // Install after mounting so any edge-injected beacon is already in the document.
  const script = document.createElement('script')
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  script.type = 'module'
  // Hype exposes the zone collector; Ghost Signs currently requires the public collector.
  script.dataset.cfBeacon = JSON.stringify({
    token: site.token,
    send: { to: site.collector },
  })
  document.body.append(script)
  return true
}
