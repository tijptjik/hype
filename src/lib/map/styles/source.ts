import type { StyleSpecification } from 'maplibre-gl'

// The SaanSeoi service requires a public access token. Keep the legacy Hype
// endpoint as a compatibility path for local installations that have not yet
// configured that token.
export const SAANSEOI_HONG_KONG_TILEJSON_URL =
  'https://tiles.saanseoi.hk/hongkong-latest.json'
export const LEGACY_HONG_KONG_TILEJSON_URL =
  'https://tiles.hype.hk/basemap/hongkong-latest.json'

const HONG_KONG_SOURCE_ID = 'hongkong-latest'

/**
 * Resolves the basemap TileJSON URL for a runtime map style.
 *
 * @param sourceUrl - URL declared by the style source.
 * @param accessToken - Optional SaanSeoi public API key.
 * @returns A TileJSON URL that can be requested by MapLibre.
 * @remarks Existing authenticated URLs are preserved so a server-resolved
 * style is not downgraded when the browser bundle has no public key.
 */
export const resolveBasemapTileJsonUrl = (
  sourceUrl: string,
  accessToken?: string | null,
): string => {
  const configuredToken = accessToken?.trim()
  let parsedUrl: URL
  try {
    parsedUrl = new URL(sourceUrl)
  } catch {
    return sourceUrl
  }

  if (parsedUrl.searchParams.get('access_token')?.trim()) {
    return parsedUrl.toString()
  }

  if (parsedUrl.origin === new URL(SAANSEOI_HONG_KONG_TILEJSON_URL).origin) {
    if (configuredToken) {
      parsedUrl.searchParams.set('access_token', configuredToken)
      return parsedUrl.toString()
    }

    return LEGACY_HONG_KONG_TILEJSON_URL
  }

  return sourceUrl
}

/**
 * Applies the runtime basemap access policy to a style copy.
 *
 * @param style - MapLibre style specification to adapt.
 * @param accessToken - Optional SaanSeoi public API key.
 * @returns A style with an accessible Hong Kong TileJSON source.
 */
export const applyRuntimeBasemapSource = (
  style: StyleSpecification,
  accessToken?: string | null,
): StyleSpecification => {
  const source = style.sources?.[HONG_KONG_SOURCE_ID]
  if (source?.type !== 'vector' || !source.url) {
    return style
  }

  const resolvedUrl = resolveBasemapTileJsonUrl(source.url, accessToken)
  if (resolvedUrl === source.url) {
    return style
  }

  return {
    ...style,
    sources: {
      ...style.sources,
      [HONG_KONG_SOURCE_ID]: {
        ...source,
        url: resolvedUrl,
      },
    },
  }
}

/**
 * Reads the optional public key exposed to browser bundles by Vite.
 *
 * @returns The configured SaanSeoi public key, or `undefined` when absent.
 */
export const getConfiguredBasemapAccessToken = (): string | undefined => {
  const value = (import.meta.env.PUBLIC_SAANSEOI_API_KEY as string | undefined)?.trim()
  return value || undefined
}
