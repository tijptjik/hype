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
