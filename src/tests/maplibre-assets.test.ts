import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveMapLibreCdnBase } from '$lib/map/maplibreAssets'

describe('MapLibre assets', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves the current latest release to an immutable CDN asset base', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ version: '6.2.0' }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveMapLibreCdnBase()).resolves.toBe(
      'https://cdn.jsdelivr.net/npm/maplibre-gl@6.2.0/dist',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.npmjs.org/maplibre-gl/latest',
      { cache: 'no-store' },
    )
  })
})
