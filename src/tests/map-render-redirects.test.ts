// TESTING
import { describe, expect, it, vi } from 'vitest'
// SVELTEKIT
import { isRedirect } from '@sveltejs/kit'
// API
import { serveMapRenderAsset } from '#lib/api/services/render.js'
import { GET } from '../routes/api/mapRenders/styles/[key]/asset/+server.js'

vi.mock('#lib/map/styles/index.js', () => ({
  isMapStyleKey: (key: string) => key === 'hyper',
  getMapStyleAssetRecord: async () => ({ hash: 'abc123' }),
}))

/**
 * Confirms the installed framework accepts a computed external asset destination.
 * @param run - Server asset handler to execute.
 * @returns Nothing when a CDN redirect is thrown; rejects ordinary errors.
 */
async function expectAssetRedirect(run: () => Promise<unknown>): Promise<void> {
  let thrown: unknown
  try {
    await run()
  } catch (error) {
    thrown = error
  }
  expect(isRedirect(thrown)).toBe(true)
  if (!isRedirect(thrown)) throw thrown
  expect(thrown.status).toBe(307)
  expect(thrown.location).toMatch(/^https:\/\//)
  expect(thrown.location).toContain('abc123.png')
}

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
        await expectAssetRedirect(() =>
          serveMapRenderAsset({
            stage,
            kind,
            identifier: 'item',
            hash: 'abc123',
            objectKey: `mapRender/${kind}/item/abc123.png`,
            notFoundMessage: 'Missing render',
          }),
        )
      }
    },
  )

  it.each(['preview', 'production'])('permits %s style CDN redirects', async stage => {
    await expectAssetRedirect(async () =>
      GET({
        params: { key: 'hyper' },
        locals: { platform: { env: { ENVIRONMENT: stage } } },
      } as unknown as Parameters<typeof GET>[0]),
    )
  })
})
