import { describe, expect, it, vi } from 'vitest'

const publicEnv = vi.hoisted(() => ({
  PUBLIC_ASSET_BASE_URL: '',
  PUBLIC_PREVIEW_ASSET_BASE_URL: '',
}))
vi.mock('$app/env/public', () => ({
  get PUBLIC_ASSET_BASE_URL() {
    return publicEnv.PUBLIC_ASSET_BASE_URL
  },
  get PUBLIC_PREVIEW_ASSET_BASE_URL() {
    return publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL
  },
}))

import {
  resolveImageAssetBaseUrl,
  resolveImageUploadEnv,
} from '#lib/client/services/image.js'

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

  it('uses the local worker preview route for preview images during local dev', () => {
    publicEnv.PUBLIC_ASSET_BASE_URL = 'http://localhost:8788'
    publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL = 'https://assets.preview.hype.hk'

    expect(resolveImageAssetBaseUrl('preview', 'http://localhost:5173')).toBe(
      'http://localhost:8788/preview',
    )
  })

  it('uses the local worker production route for production images during local dev', () => {
    publicEnv.PUBLIC_ASSET_BASE_URL = 'http://localhost:8788'
    publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL = 'https://assets.preview.hype.hk'

    expect(resolveImageAssetBaseUrl('production', 'http://localhost:5173')).toBe(
      'http://localhost:8788/production',
    )
  })

  it('preserves an explicitly configured production host during local dev', () => {
    publicEnv.PUBLIC_ASSET_BASE_URL = 'https://assets.hype.hk'
    publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL = 'https://assets.preview.hype.hk'

    expect(resolveImageAssetBaseUrl('production', 'http://hype.localhost')).toBe(
      'https://assets.hype.hk',
    )
  })

  it('keeps deployed production sessions on the production asset host', () => {
    publicEnv.PUBLIC_ASSET_BASE_URL = 'http://localhost:8788'
    publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL = 'https://assets.preview.hype.hk'

    expect(resolveImageAssetBaseUrl('production', 'https://hype.hk')).toBe(
      'https://assets.hype.hk',
    )
  })

  it.each(['local', 'preview', 'production'] as const)(
    'uses the local %s route when a local app session is missing public asset env',
    stage => {
      publicEnv.PUBLIC_ASSET_BASE_URL = ''
      publicEnv.PUBLIC_PREVIEW_ASSET_BASE_URL = ''

      expect(resolveImageAssetBaseUrl(stage, 'http://hype.localhost')).toBe(
        `http://assets.hype.localhost${stage === 'local' ? '' : `/${stage}`}`,
      )
    },
  )
})

describe('uploadPreparedImageObject', () => {
  it('forwards the signed condition and rejects collisions instead of accepting unknown bytes', async () => {
    const { uploadPreparedImageObject } = await import('#lib/client/services/image.js')
    const prepared = {
      auth: {
        uploadUrl: 'https://upload.example.test/image',
        method: 'PUT',
        headers: { 'if-none-match': '*' },
      },
      normalizedUpload: { file: new Blob(['abc']) },
    } as unknown as Awaited<
      ReturnType<typeof import('#lib/client/services/image.js')['prepareImageUpload']>
    >
    const fetchFn = vi.fn(async () => new Response(null, { status: 412 }))
    await expect(
      uploadPreparedImageObject(prepared, fetchFn as unknown as typeof fetch),
    ).rejects.toThrow('Start a new upload')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith(
      prepared.auth.uploadUrl,
      expect.objectContaining({ headers: { 'if-none-match': '*' } }),
    )
  })
})
