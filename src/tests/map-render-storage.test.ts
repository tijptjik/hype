import { describe, expect, it } from 'vitest'

import {
  buildMapRenderObjectKey,
  getMapRenderAssetBaseUrl,
  getMapRenderStage,
  getMapRenderStorageMode,
  resolveMapRenderAssetUrl,
} from '$lib/map/renders/storage.shared'
import {
  getMapStyleRenderObjectKey,
  getMapStyleRenderOrigin,
  resolveMapStyleRenderUrl,
} from '$lib/map/styles/render.shared'

describe('map render storage helpers', () => {
  it('maps runtime environments to render stages', () => {
    expect(getMapRenderStage('preview')).toBe('preview')
    expect(getMapRenderStage('production')).toBe('production')
    expect(getMapRenderStage('local')).toBe('local')
    expect(getMapRenderStage(undefined)).toBe('local')
  })

  it('builds immutable render object keys', () => {
    expect(
      buildMapRenderObjectKey({
        kind: 'styles',
        identifier: 'hyper',
        hash: 'abc123',
      }),
    ).toBe('mapRender/styles/hyper/abc123.png')

    expect(getMapStyleRenderObjectKey('hyper', 'abc123')).toBe(
      'mapRender/styles/hyper/abc123.png',
    )
  })

  it('resolves local renders to dev-bucket-backed asset routes', () => {
    expect(getMapRenderStorageMode('local')).toBe('r2')
    expect(getMapRenderAssetBaseUrl('local')).toBeNull()

    expect(
      resolveMapRenderAssetUrl(
        'local',
        {
          kind: 'styles',
          identifier: 'hyper',
          hash: 'abc123',
        },
        '/mapRender/styles/hyper/abc123.png',
      ),
    ).toBe('/mapRender/styles/hyper/abc123.png')

    expect(resolveMapStyleRenderUrl('local', 'hyper', 'abc123')).toBe(
      '/api/mapRenders/styles/hyper/asset',
    )
  })

  it('resolves preview and production renders to CDN URLs', () => {
    expect(getMapRenderStorageMode('preview')).toBe('r2')
    expect(getMapRenderAssetBaseUrl('preview')).toBe('https://assets.preview.hype.hk')
    expect(getMapRenderAssetBaseUrl('production')).toBe('https://assets.hype.hk')

    expect(resolveMapStyleRenderUrl('preview', 'hyper', 'abc123')).toBe(
      'https://assets.preview.hype.hk/mapRender/styles/hyper/abc123.png',
    )

    expect(resolveMapStyleRenderUrl('production', 'hyper', 'abc123')).toBe(
      'https://assets.hype.hk/mapRender/styles/hyper/abc123.png',
    )
  })

  it('resolves stage-specific headless render origins', () => {
    expect(getMapStyleRenderOrigin('http://localhost:5173')).toBe(
      'http://localhost:5173',
    )
    expect(getMapStyleRenderOrigin('https://preview.hype.hk')).toBe(
      'https://preview.hype.hk',
    )
    expect(getMapStyleRenderOrigin('https://hype.hk')).toBe('https://hype.hk')
    expect(getMapStyleRenderOrigin()).toBe('http://localhost:5173')
  })
})
