import { describe, expect, it } from 'vitest'

import {
  buildMapRenderObjectKey,
  getMapRenderAssetBaseUrl,
  getMapRenderStage,
  getMapRenderStorageMode,
  resolveMapRenderAssetUrl,
} from '#lib/map/renders/storage.shared.js'
import {
  getMapStyleRenderAssetPath,
  resolveMapStyleRenderPathForKey,
  getMapStyleRenderObjectKey,
  getMapStyleRenderOrigin,
  resolveMapStyleRenderUrl,
} from '#lib/map/styles/render.shared.js'

describe('map render storage helpers', () => {
  it('uses current style codes for previews', async () => {
    for (const key of ['hype-dark', 'hype-light'] as const) {
      expect(getMapStyleRenderAssetPath(key)).toBe(
        `/api/mapRenders/styles/${key}/asset`,
      )
      expect(await resolveMapStyleRenderPathForKey('production', key)).toMatch(
        new RegExp(
          String.raw`^https://assets\.hype\.hk/mapRender/styles/${key}/[a-f0-9]+\.png$`,
        ),
      )
    }
  })
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
        identifier: 'hype-dark',
        hash: 'abc123',
      }),
    ).toBe('mapRender/styles/hype-dark/abc123.png')

    expect(getMapStyleRenderObjectKey('hype-dark', 'abc123')).toBe(
      'mapRender/styles/hype-dark/abc123.png',
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
          identifier: 'hype-dark',
          hash: 'abc123',
        },
        '/mapRender/styles/hype-dark/abc123.png',
      ),
    ).toBe('/mapRender/styles/hype-dark/abc123.png')

    expect(resolveMapStyleRenderUrl('local', 'hype-dark', 'abc123')).toBe(
      '/api/mapRenders/styles/hype-dark/asset',
    )
  })

  it('resolves preview and production renders to CDN URLs', () => {
    expect(getMapRenderStorageMode('preview')).toBe('r2')
    expect(getMapRenderAssetBaseUrl('preview')).toBe('https://assets.preview.hype.hk')
    expect(getMapRenderAssetBaseUrl('production')).toBe('https://assets.hype.hk')

    expect(resolveMapStyleRenderUrl('preview', 'hype-dark', 'abc123')).toBe(
      'https://assets.preview.hype.hk/mapRender/styles/hype-dark/abc123.png',
    )

    expect(resolveMapStyleRenderUrl('production', 'hype-dark', 'abc123')).toBe(
      'https://assets.hype.hk/mapRender/styles/hype-dark/abc123.png',
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
    expect(getMapStyleRenderOrigin()).toBe('http://hype.localhost')
  })
})
