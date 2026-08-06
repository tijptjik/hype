import { describe, expect, it } from 'vitest'

import { MAPLIBRE_VERSION } from '$lib/map/maplibreAssets'

describe('MapLibre assets', () => {
  it('pins the production CDN module to the installed MapLibre version', () => {
    expect(MAPLIBRE_VERSION).toBe('6.1.0')
  })
})
