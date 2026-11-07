// @vitest-environment node
// TESTS
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { database, readPin, getObject, getDerived, authorizePreview } = vi.hoisted(
  () => ({
    database: { get: vi.fn(async () => ({ n: 0 })) },
    readPin: vi.fn(),
    getObject: vi.fn(),
    getDerived: vi.fn(),
    authorizePreview: vi.fn(),
  }),
)
vi.mock('#lib/api/index.js', () => ({
  getDatabaseWithoutAuth: vi.fn(async () => ({ db: database })),
}))
vi.mock('#lib/db/services/imageRevisionDelivery.js', async original => ({
  ...(await original<object>()),
  readImageRevisionAddress: readPin,
}))
vi.mock('#lib/images/storage.js', async original => ({
  ...(await original<object>()),
  getOriginalsBucketForStage: () => ({ get: getObject }),
  getDerivedBucketForStage: () => ({ get: getDerived }),
}))
vi.mock('#lib/api/services/authz/feature.js', () => ({
  authorizeFeatureAdminReadForProbe: authorizePreview,
}))
vi.mock('#lib/db/services/feature.js', () => ({
  probeFeatureQuery: vi.fn(async () => ({ id: 'f' })),
}))
vi.mock('#lib/db/services/user.js', () => ({ getUserRoles: vi.fn(async () => []) }))
vi.mock('#lib/db/services/featureCommandScope.js', async () => {
  const { sql } = await import('drizzle-orm')
  return { buildFeatureCommandScopeGuard: () => sql`1` }
})
import { GET } from '../routes/api/images/revisions/[revision]/+server'

const bytes = new Uint8Array([1, 2, 3])
const request = () =>
  GET({
    params: { revision: 'r1' },
    locals: { platform: {} },
    url: new URL('https://example.test/api/images/revisions/r1'),
  } as never)
beforeEach(async () => {
  vi.clearAllMocks()
  getDerived.mockResolvedValue(null)
  authorizePreview.mockReturnValue({ allowed: false })
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    n => n.toString(16).padStart(2, '0'),
  ).join('')
  readPin.mockResolvedValue({
    revisionId: 'r1',
    imageId: 'i1',
    storageNamespace: 'local',
    storageKey: 'exact/key',
    contentHash: hash,
    mediaType: 'image/png',
    byteSize: bytes.length,
    metadata: {},
  })
  getObject.mockResolvedValue({
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
  })
})
describe('immutable image HTTP delivery', () => {
  it('delivers a discovered image without a session or feature authorization', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(authorizePreview).not.toHaveBeenCalled()
    expect(readPin).toHaveBeenCalledOnce()
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
  })
  it('transforms verified bytes with the pinned rotation without rechecking viewer permissions', async () => {
    const pin = await readPin()
    readPin.mockResolvedValue({ ...pin, metadata: { renderRotation: 90 } })
    const binding = {
      fetch: vi.fn(
        async () =>
          new Response('transformed', { headers: { 'content-type': 'image/webp' } }),
      ),
    }
    const response = await GET({
      params: { revision: 'r1' },
      locals: { platform: { env: { ASSET_TRANSFORMER: binding } } },
      url: new URL(
        'https://example.test/api/images/revisions/r1?t=c_fit,w_100&rotation=270&source=https://untrusted.test',
      ),
    } as never)
    const [target, init] = binding.fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(new URL(target).search).toBe('?t=c_fit%2Cw_100')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'content-type': 'image/png',
      'x-revision-render-rotation': '90',
    })
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(bytes)
    expect(await response.text()).toBe('transformed')
    expect(readPin).toHaveBeenCalledTimes(2)
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
  })
  it('initializes a request database and delivers only verified exact bytes with immutable browser caching', async () => {
    const response = await request()
    expect(readPin).toHaveBeenCalledWith(database, 'r1')
    expect(getObject).toHaveBeenCalledWith('exact/key')
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })
  it.each(['size', 'digest'])(
    'refuses changed object %s without falling back to another version',
    async mismatch => {
      getObject.mockResolvedValue({
        size: mismatch === 'size' ? 4 : 3,
        arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
      })
      await expect(request()).rejects.toMatchObject({ status: 409 })
      expect(getObject).toHaveBeenCalledTimes(1)
    },
  )
  it('does not read storage when the exact revision does not exist', async () => {
    readPin.mockResolvedValue(null)
    await expect(request()).rejects.toMatchObject({ status: 404 })
    expect(getObject).not.toHaveBeenCalled()
  })
})

describe('existing thumbnail cache delivery', () => {
  it('streams the exact prerender without reading originals, transforming or repeating authorization', async () => {
    const pin = await readPin()
    readPin.mockReset().mockResolvedValue({ ...pin, metadata: { version: 7 } })
    getDerived.mockResolvedValue({
      body: new TextEncoder().encode('cached thumbnail'),
      size: 16,
      httpMetadata: { contentType: 'image/webp' },
    })
    const response = await GET({
      params: { revision: 'r1' },
      locals: { platform: {} },
      url: new URL(
        'https://example.test/api/images/revisions/r1?t=c_fill,h_256,w_256&v=999',
      ),
    } as never)
    expect(await response.text()).toBe('cached thumbnail')
    expect(getDerived).toHaveBeenCalledWith(
      'exact/key/v7/c_fill,w_256,h_256,g_auto,q_auto,f_webp',
    )
    expect(getObject).not.toHaveBeenCalled()
    expect(readPin).toHaveBeenCalledOnce()
    expect(response.headers.get('x-image-cache')).toBe('r2-derived-hit')
  })

  it('renders the exact source when the requested cached version is absent', async () => {
    const pin = await readPin()
    readPin.mockResolvedValue({ ...pin, metadata: { version: 7 } })
    const binding = {
      fetch: vi.fn(
        async () =>
          new Response('rendered', { headers: { 'content-type': 'image/webp' } }),
      ),
    }
    const response = await GET({
      params: { revision: 'r1' },
      locals: { platform: { env: { ASSET_TRANSFORMER: binding } } },
      url: new URL('https://example.test/api/images/revisions/r1?t=c_fill,h_256,w_256'),
    } as never)
    expect(await response.text()).toBe('rendered')
    expect(getDerived).toHaveBeenCalledOnce()
    expect(getObject).toHaveBeenCalledWith('exact/key')
    expect(binding.fetch).toHaveBeenCalledOnce()
  })

  it('does not expose cached thumbnails when the revision address does not exist', async () => {
    readPin.mockResolvedValue(null)
    await expect(
      GET({
        params: { revision: 'r1' },
        locals: { platform: {} },
        url: new URL(
          'https://example.test/api/images/revisions/r1?t=c_fill,h_256,w_256',
        ),
      } as never),
    ).rejects.toMatchObject({ status: 404 })
    expect(getDerived).not.toHaveBeenCalled()
    expect(getObject).not.toHaveBeenCalled()
  })
})
