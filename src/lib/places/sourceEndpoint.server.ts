/**
 * Select the trusted Places endpoint, with a loopback-only development override.
 * @param apiKey Credential for the hosted SaanSeoi API.
 * @returns Server-owned URL and credential; no client request controls either value.
 * @remarks HYPE_PLACE_SOURCE_URL is ignored outside development. Local rehearsals
 * use a dummy credential so production keys are never forwarded to a local server.
 */
export function placeSourceEndpoint(apiKey: string): {
  baseUrl: string
  apiKey: string
} {
  if (!import.meta.env.DEV || !import.meta.env.HYPE_PLACE_SOURCE_URL)
    return { baseUrl: 'https://api.saanseoi.hk', apiKey }
  const url = new URL(import.meta.env.HYPE_PLACE_SOURCE_URL)
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Place development source must be a loopback HTTP origin')
  return { baseUrl: url.origin, apiKey: 'local-development' }
}
