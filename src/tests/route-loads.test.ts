// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('route loads', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.doUnmock('@sveltejs/kit')
    vi.doUnmock('drizzle-orm/d1')
    vi.doUnmock('$lib/db/services/hub')
    vi.doUnmock('$lib/navigation/title')
    vi.doUnmock('$lib/images/storage')
    vi.doUnmock('$lib/map/styles')
    vi.doUnmock('$lib/map/styles/serve')
  })

  it('URL-encodes usernames when redirecting to the profile panel', async () => {
    vi.doMock('@sveltejs/kit', () => ({
      redirect: (status: number, location: string) => {
        const error = new Error('redirect') as Error & {
          status: number
          location: string
        }
        error.status = status
        error.location = location
        throw error
      },
    }))

    const route = await import('../routes/(app)/users/[username]/+page')

    await expect(
      route.load({
        params: {
          username: 'name&role=admin?#test',
        },
      } as never),
    ).rejects.toMatchObject({
      status: 302,
      location: '/?panel=profile&username=name%26role%3Dadmin%3F%23test',
    })
  })

  it('returns null hub user state when the subscription lookup fails', async () => {
    const mockDb = { kind: 'db' }
    const mockGetHubUserSubscriptionState = vi.fn(async () => {
      throw new Error('lookup failed')
    })
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    vi.doMock('drizzle-orm/d1', () => ({
      drizzle: vi.fn(() => mockDb),
    }))
    vi.doMock('$lib/db/services/hub', () => ({
      getHubUserSubscriptionState: mockGetHubUserSubscriptionState,
    }))
    vi.doMock('$lib/navigation/title', () => ({
      getTitleEnvironmentLabel: vi.fn(() => 'Preview'),
    }))

    const route = await import('../routes/+layout.server')

    const result = await route.load({
      platform: {
        env: {
          DB: {},
          ENVIRONMENT: 'preview',
        },
      },
      locals: {
        user: { id: 'user-1' },
        hub: { id: 'hub-1' },
      },
    } as never)

    expect(mockGetHubUserSubscriptionState).toHaveBeenCalledWith(mockDb, {
      hubId: 'hub-1',
      userId: 'user-1',
    })
    expect(result.hubUserState).toBe(null)
    expect(result.titleEnvironmentLabel).toBe('Preview')
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch hub user subscription state:',
      expect.any(Error),
    )
  })

  it('rejects invalid map style keys before serving the style payload', async () => {
    vi.doMock('@sveltejs/kit', () => ({
      error: (status: number, message: string) => {
        const thrown = new Error(message) as Error & {
          status: number
          body: { message: string }
        }
        thrown.status = status
        thrown.body = { message }
        throw thrown
      },
    }))
    vi.doMock('$lib/map/styles', () => ({
      isMapStyleKey: vi.fn(() => false),
    }))
    const serveMapStyleByKey = vi.fn()
    vi.doMock('$lib/map/styles/serve', () => ({
      serveMapStyleByKey,
    }))

    const route = await import('../routes/api/mapStyles/[key]/+server')

    await expect(
      route.GET({
        params: {
          key: 'not-a-style',
        },
        request: new Request('https://example.com/api/mapStyles/not-a-style'),
      } as never),
    ).rejects.toMatchObject({
      status: 404,
    })
    expect(serveMapStyleByKey).not.toHaveBeenCalled()
  })

  it('proxies avatar responses with a safe fallback content type', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({
        'cache-control': 'public, max-age=60',
        'content-type': 'image/png',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const route = await import('../routes/proxy/avatar/+server')

    const response = await route.GET({
      url: new URL(
        'https://example.com/proxy/avatar?url=https%3A%2F%2Flh3.googleusercontent.com%2Fa%2Favatar.png',
      ),
    } as never)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
  })

  it('omits the etag header when the uploaded image object has no etag', async () => {
    const bucket = {
      get: vi.fn(async () => ({
        body: new ReadableStream(),
        httpEtag: undefined,
        httpMetadata: {
          contentType: 'image/jpeg',
        },
      })),
    }

    vi.doMock('$lib/images/storage', () => ({
      getOriginalsBucketForStage: vi.fn(() => bucket),
      readManifestVersion: vi.fn(async () => 7),
      toImageStage: vi.fn(() => 'local'),
    }))

    const route = await import(
      '../routes/[appEnv=appEnv]/image/upload/[...path]/+server'
    )

    const response = await route.GET({
      params: {
        appEnv: 'local',
        path: 'v7/gallery/photo.jpg',
      },
      platform: {
        env: {},
      },
    } as never)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('etag')).toBe(null)
  })
})
