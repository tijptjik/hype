import { describe, expect, it } from 'vitest'

import {
  applyRuntimeBasemapSource,
  LEGACY_HONG_KONG_TILEJSON_URL,
  resolveBasemapTileJsonUrl,
  SAANSEOI_HONG_KONG_TILEJSON_URL,
} from '$lib/map/styles/source'
import type { StyleSpecification } from 'maplibre-gl'

describe('runtime basemap source policy', () => {
  it('falls back to the public legacy endpoint when no SaanSeoi key is configured', () => {
    expect(resolveBasemapTileJsonUrl(SAANSEOI_HONG_KONG_TILEJSON_URL)).toBe(
      LEGACY_HONG_KONG_TILEJSON_URL,
    )
  })

  it('adds a SaanSeoi access token when one is configured', () => {
    expect(resolveBasemapTileJsonUrl(SAANSEOI_HONG_KONG_TILEJSON_URL, 'pk.test')).toBe(
      `${SAANSEOI_HONG_KONG_TILEJSON_URL}?access_token=pk.test`,
    )
  })

  it('leaves authenticated styles and unrelated sources unchanged', () => {
    const authenticatedUrl = `${SAANSEOI_HONG_KONG_TILEJSON_URL}?access_token=pk.test`
    expect(resolveBasemapTileJsonUrl(authenticatedUrl)).toBe(authenticatedUrl)

    const style = {
      version: 8,
      sources: {
        'hongkong-latest': { type: 'vector', url: SAANSEOI_HONG_KONG_TILEJSON_URL },
        other: { type: 'vector', url: 'https://example.com/tiles.json' },
      },
      layers: [],
    } as unknown as StyleSpecification

    const resolved = applyRuntimeBasemapSource(style)
    const resolvedSources = resolved.sources as Record<string, { url?: string }>
    const originalSources = style.sources as Record<string, { url?: string }>
    expect(resolvedSources['hongkong-latest']?.url).toBe(LEGACY_HONG_KONG_TILEJSON_URL)
    expect(resolvedSources.other?.url).toBe('https://example.com/tiles.json')
    expect(originalSources['hongkong-latest']?.url).toBe(
      SAANSEOI_HONG_KONG_TILEJSON_URL,
    )
  })
})
