/**
 * Select the trusted Locations endpoint, with a local development override.
 * @param apiKey Credential for the hosted SaanSeoi API.
 * @returns Server-owned URL and credential; no client request controls either value.
 * @remarks Development defaults to api.atlas.localhost; overrides are ignored outside development. Local rehearsals
 * use a dummy credential so production keys are never forwarded to a local server.
 */
export function locationSourceEndpoint(apiKey: string): {
  baseUrl: string
  apiKey: string
} {
  if (!import.meta.env.DEV) return { baseUrl: 'https://api.saanseoi.hk', apiKey }
  const url = new URL(
    import.meta.env.HYPE_LOCATION_SOURCE_URL || 'http://api.atlas.localhost',
  )
  if (
    url.protocol !== 'http:' ||
    !['api.atlas.localhost', 'localhost', '127.0.0.1', '[::1]'].includes(
      url.hostname,
    ) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Location development source must be a loopback HTTP origin')
  return { baseUrl: url.origin, apiKey: 'local-development' }
}
