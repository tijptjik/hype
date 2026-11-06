// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
// IMAGE PRESENTATION
import { resolvePresentationSource } from '#lib/images/presentationSource.js'
// ROUTE
import { GET } from '../routes/api/images/presentation-source/+server'

const source = 'https://assets.hype.hk/image/upload/c_fit,w_1024/v123/example/logo'
const request = (src = source) =>
  GET({
    url: new URL(
      `https://hype.hk/api/images/presentation-source?src=${encodeURIComponent(src)}`,
    ),
  } as never)
afterEach(() => vi.unstubAllGlobals())

describe('public presentation source boundary', () => {
  it.each([
    'http://127.0.0.1/image/raw/private',
    'https://attacker.test/image/raw/private',
    'https://assets.hype.hk.attacker.test/image/raw/private',
    'https://user:password@assets.hype.hk/image/raw/private',
    'https://assets.hype.hk/api/private',
    'https://assets.hype.hk/image/raw/a%2f..%2fprivate',
    'https://assets.hype.hk/image/raw/logo?redirect=https://attacker.test',
    'http://assets.hype.localhost/image/raw/local',
  ])('rejects %s before network I/O', async src => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(resolvePresentationSource(src, 'https://hype.hk')).toBeNull()
    await expect(request(src)).rejects.toMatchObject({ status: 400 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('allows local delivery only on local app origins', () => {
    expect(
      resolvePresentationSource(
        'http://assets.hype.localhost/production/image/raw/v123/logo',
        'http://localhost:5175',
      )?.hostname,
    ).toBe('assets.hype.localhost')
  })

  it('streams a public raster image without forwarding request credentials or following redirects', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2]), {
          headers: { 'content-type': 'image/png' },
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const response = await request()
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2])
    expect(fetcher).toHaveBeenCalledWith(
      new URL(source),
      expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it.each(['text/html', 'image/svg+xml', 'application/json'])(
    'refuses %s bodies',
    async contentType => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('body', { headers: { 'content-type': contentType } }),
        ),
      )
      await expect(request()).rejects.toMatchObject({ status: 415 })
    },
  )

  it('refuses oversized declared bodies and caps chunked responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('body', {
            headers: {
              'content-type': 'image/png',
              'content-length': String(9 * 1024 * 1024),
            },
          }),
      ),
    )
    await expect(request()).rejects.toMatchObject({ status: 413 })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(8 * 1024 * 1024 + 1), {
            headers: { 'content-type': 'image/png' },
          }),
      ),
    )
    const response = await request()
    await expect(response.arrayBuffer()).rejects.toThrow('Presentation image too large')
  })
})
