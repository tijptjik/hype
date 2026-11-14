// @vitest-environment node
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
// ROUTE
import { GET } from '../routes/api/dev-basemap/[...path]/+server'

const fetcher = vi.fn()
function event(path: string) {
  return {
    params: { path },
    url: new URL(`http://localhost:4173/api/dev-basemap/${path}`),
    locals: { platform: { env: { VITE_SAANSEOI_API_KEY: 'server-only-test-key' } } },
    fetch: fetcher,
  } as unknown as Parameters<typeof GET>[0]
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})
it('never exposes a proxy in production or permits arbitrary paths', async () => {
  vi.stubEnv('DEV', false)
  await expect(GET(event('hongkong-latest.json'))).rejects.toMatchObject({
    status: 404,
  })
  vi.stubEnv('DEV', true)
  await expect(GET(event('other.json'))).rejects.toMatchObject({ status: 404 })
  expect(fetcher).not.toHaveBeenCalled()
})
it('authenticates TileJSON on the server and rewrites its tile URLs', async () => {
  vi.stubEnv('DEV', true)
  fetcher.mockResolvedValue(
    Response.json({
      tiles: [
        'https://tiles.saanseoi.hk/hongkong-latest/{z}/{x}/{y}.mvt?v=abc&access_token=must-not-leak',
      ],
    }),
  )
  const response = await GET(event('hongkong-latest.json'))
  const body = await response.text()
  expect(JSON.parse(body).tiles).toEqual([
    'http://localhost:4173/api/dev-basemap/hongkong-latest/{z}/{x}/{y}.mvt?v=abc',
  ])
  expect(body).not.toContain('server-only-test-key')
  expect(body).not.toContain('must-not-leak')
  expect(fetcher.mock.calls[0][1].headers).toEqual({
    'x-api-key': 'server-only-test-key',
  })
})
it('rejects unexpected upstream tile hosts', async () => {
  vi.stubEnv('DEV', true)
  fetcher.mockResolvedValue(
    Response.json({ tiles: ['https://example.com/hongkong-latest/{z}/{x}/{y}.mvt'] }),
  )
  await expect(GET(event('hongkong-latest.json'))).rejects.toMatchObject({
    status: 502,
  })
})
it('streams vector tiles without forwarding credential or upstream headers', async () => {
  vi.stubEnv('DEV', true)
  fetcher.mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        'Set-Cookie': 'unexpected=value',
      },
    }),
  )
  const response = await GET(event('hongkong-latest/15/26772/14302.mvt'))
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new Uint8Array([1, 2, 3]),
  )
  expect(response.headers.get('Set-Cookie')).toBeNull()
})
