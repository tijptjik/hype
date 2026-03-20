import { describe, expect, it } from 'vitest'

import {
  buildPreviewObjectKey,
  getPreviewAssetBaseUrl,
  getPreviewStage,
  getPreviewStorageMode,
  resolvePreviewAssetUrl,
} from '$lib/map/previews/storage.shared'
import {
  getMapStylePreviewObjectKey,
  getMapStylePreviewRenderOrigin,
  resolveMapStylePreviewUrl,
} from '$lib/map/styles/preview.shared'

describe('preview storage helpers', () => {
  it('maps runtime environments to preview stages', () => {
    expect(getPreviewStage('preview')).toBe('preview')
    expect(getPreviewStage('production')).toBe('production')
    expect(getPreviewStage('local')).toBe('local')
    expect(getPreviewStage(undefined)).toBe('local')
  })

  it('builds immutable preview object keys', () => {
    expect(
      buildPreviewObjectKey({
        kind: 'styles',
        identifier: 'hyper',
        hash: 'abc123',
      }),
    ).toBe('mapPreviews/styles/hyper/abc123.png')

    expect(getMapStylePreviewObjectKey('hyper', 'abc123')).toBe(
      'mapPreviews/styles/hyper/abc123.png',
    )
  })

  it('resolves local previews to static assets', () => {
    expect(getPreviewStorageMode('local')).toBe('local-static')
    expect(getPreviewAssetBaseUrl('local')).toBeNull()

    expect(
      resolvePreviewAssetUrl(
        'local',
        {
          kind: 'styles',
          identifier: 'hyper',
          hash: 'abc123',
        },
        '/mapPreviews/styles/hyper/abc123.png',
      ),
    ).toBe('/mapPreviews/styles/hyper/abc123.png')
  })

  it('resolves preview and production previews to CDN URLs', () => {
    expect(getPreviewStorageMode('preview')).toBe('r2')
    expect(getPreviewAssetBaseUrl('preview')).toBe('https://assets.preview.hype.hk')
    expect(getPreviewAssetBaseUrl('production')).toBe('https://assets.hype.hk')

    expect(resolveMapStylePreviewUrl('preview', 'hyper', 'abc123')).toBe(
      'https://assets.preview.hype.hk/mapPreviews/styles/hyper/abc123.png',
    )

    expect(resolveMapStylePreviewUrl('production', 'hyper', 'abc123')).toBe(
      'https://assets.hype.hk/mapPreviews/styles/hyper/abc123.png',
    )
  })

  it('resolves stage-specific headless render origins', () => {
    expect(getMapStylePreviewRenderOrigin('http://localhost:5173')).toBe(
      'http://localhost:5173',
    )
    expect(getMapStylePreviewRenderOrigin('https://preview.hype.hk')).toBe(
      'https://preview.hype.hk',
    )
    expect(getMapStylePreviewRenderOrigin('https://hype.hk')).toBe('https://hype.hk')
    expect(getMapStylePreviewRenderOrigin()).toBe('http://localhost:5173')
  })
})
