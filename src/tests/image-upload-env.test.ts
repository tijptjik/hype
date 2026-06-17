import { env as publicEnv } from '$env/dynamic/public'
import { describe, expect, it } from 'vitest'

import {
  resolveImageAssetBaseUrl,
  resolveImageUploadEnv,
} from '$lib/client/services/image'

describe('resolveImageUploadEnv', () => {
  it('uses the asset base URL for local app development', () => {
    expect(
      resolveImageUploadEnv({
        appOrigin: 'http://localhost:5173',
        assetBaseUrl: 'http://localhost:8788',
      }),
    ).toBe('local')
  })

  it('preserves preview routing for local preview sessions', () => {
    expect(
      resolveImageUploadEnv({
        appOrigin: 'http://localhost:5173',
        assetBaseUrl: 'https://assets.preview.hype.hk',
      }),
    ).toBe('preview')
  })

  it('preserves production routing for local production sessions', () => {
    expect(
      resolveImageUploadEnv({
        appOrigin: 'http://localhost:5173',
        assetBaseUrl: 'https://assets.hype.hk',
      }),
    ).toBe('production')
  })

  it('trusts the deployed app origin for non-local environments', () => {
    expect(
      resolveImageUploadEnv({
        appOrigin: 'https://preview.hype.hk',
        assetBaseUrl: 'http://localhost:8788',
      }),
    ).toBe('preview')
  })
})

describe('resolveImageAssetBaseUrl', () => {
  it('uses the configured local asset worker for local images', () => {
    publicEnv.PUBLIC_ASSET_BASE_URL = 'http://localhost:8788'
    publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL = 'https://assets.preview.hype.hk'

    expect(resolveImageAssetBaseUrl('local', 'http://localhost:5173')).toBe(
      'http://localhost:8788',
    )
  })

  it('uses the preview asset host for preview images during local dev', () => {
    publicEnv.PUBLIC_ASSET_BASE_URL = 'http://localhost:8788'
    publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL = 'https://assets.preview.hype.hk'

    expect(resolveImageAssetBaseUrl('preview', 'http://localhost:5173')).toBe(
      'https://assets.preview.hype.hk',
    )
  })

  it('uses the production asset host for production images during local dev', () => {
    publicEnv.PUBLIC_ASSET_BASE_URL = 'http://localhost:8788'
    publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL = 'https://assets.preview.hype.hk'

    expect(resolveImageAssetBaseUrl('production', 'http://localhost:5173')).toBe(
      'https://assets.hype.hk',
    )
  })

  it('falls back to the local asset worker when a local app session is missing public asset env', () => {
    publicEnv.PUBLIC_ASSET_BASE_URL = ''
    publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL = ''

    expect(resolveImageAssetBaseUrl('local', 'http://localhost:5173')).toBe(
      'http://localhost:8788',
    )
  })
})
