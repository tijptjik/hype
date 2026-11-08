// TESTING
import { describe, expect, it, vi } from 'vitest'
// SVELTEKIT
// API
import { serveMapRenderAsset } from '#lib/api/services/render.js'
import { GET } from '../routes/api/mapRenders/styles/[key]/asset/+server.js'

vi.mock('#lib/map/styles/index.js', () => ({
  isMapStyleKey: (key: string) => key === 'hype-dark',
  getMapStyleAssetRecord: async () => ({ hash: 'abc123' }),
}))

describe('SvelteKit 3 external map render redirects', () => {
  it.each(['layers', 'projects'] as const)(
    'reads local %s renders from dev, preview, then production without changing the hash',
    async kind => {
      const objectKey = `mapRender/${kind}/item/abc123.png`
      for (let availableIndex = 0; availableIndex < 3; availableIndex++) {
        const buckets = Array.from({ length: 3 }, (_, index) => ({
          get: vi
            .fn()
            .mockResolvedValue(
              index === availableIndex
                ? { body: 'png', httpMetadata: { contentType: 'image/png' } }
                : null,
            ),
        }))
        const response = await serveMapRenderAsset({
          platform: {
            env: {
              ASSET_PUBLIC_DEV: buckets[0],
              ASSET_PUBLIC_PREVIEW: buckets[1],
              ASSET_PUBLIC_PRODUCTION: buckets[2],
            },
          } as unknown as App.Platform,
          stage: 'local',
          kind,
          identifier: 'item',
          hash: 'abc123',
          objectKey,
          notFoundMessage: 'Missing render',
        })
        expect(await response.text()).toBe('png')
        expect(response.headers.get('content-type')).toBe('image/png')
        buckets.forEach((bucket, index) => {
          if (index <= availableIndex)
            expect(bucket.get).toHaveBeenCalledWith(objectKey)
          else expect(bucket.get).not.toHaveBeenCalled()
        })
      }
    },
  )

  it('returns 404 when the exact render is absent from every local-readable bucket', async () => {
    const get = vi.fn().mockResolvedValue(null)
    await expect(
      serveMapRenderAsset({
        platform: {
          env: {
            ASSET_PUBLIC_DEV: { get },
            ASSET_PUBLIC_PREVIEW: { get },
            ASSET_PUBLIC_PRODUCTION: { get },
          },
        } as unknown as App.Platform,
        stage: 'local',
        kind: 'projects',
        identifier: 'item',
        hash: 'abc123',
        objectKey: 'mapRender/projects/item/abc123.png',
        notFoundMessage: 'Missing render',
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(get).toHaveBeenCalledTimes(3)
  })

  it.each(['preview', 'production'])(
    'permits %s layer and project CDN redirects',
    async stage => {
      for (const kind of ['layers', 'projects'] as const) {
        const response = await serveMapRenderAsset({
          platform: {
            env: {
              ENVIRONMENT: stage,
              ASSET_PUBLIC_PREVIEW: { head: vi.fn().mockResolvedValue({}) },
              ASSET_PUBLIC_PRODUCTION: { head: vi.fn().mockResolvedValue({}) },
            },
          } as unknown as App.Platform,
          stage,
          kind,
          identifier: 'item',
          hash: 'abc123',
          objectKey: `mapRender/${kind}/item/abc123.png`,
          notFoundMessage: 'Missing render',
        })
        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe(
          `https://assets.${stage === 'preview' ? 'preview.' : ''}hype.hk/mapRender/${kind}/item/abc123.png`,
        )
        expect(response.headers.get('cache-control')).toBe('no-store')
      }
    },
  )

  it.each(['preview', 'production'])(
    'redirects %s built-in styles to their bundled preview',
    async stage => {
      await expect(
        GET({
          params: { key: 'hype-dark' },
          locals: { platform: { env: { ENVIRONMENT: stage } } },
        } as unknown as Parameters<typeof GET>[0]),
      ).rejects.toMatchObject({
        status: 307,
        location: '/mapStylePreviews/hype-dark.png',
      })
    },
  )
})
