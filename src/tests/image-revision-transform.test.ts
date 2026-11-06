// @vitest-environment node
// TESTS
import { describe, expect, it, vi } from 'vitest'
// DOMAIN
import { parseRevisionTransformOptions } from '#lib/images/revisionTransformOptions.js'
import { transformImageRevision } from '#lib/images/revisionTransform.js'
import { handleRevisionTransform } from '../../workers/asset-service/src/revision'

const bytes = new Uint8Array([1, 2, 3]).buffer
const request = (
  query = 't=c_fit,w_100',
  rotation = '90',
  body: BodyInit = bytes,
): Request =>
  new Request('https://private.test/?' + query, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'x-revision-render-rotation': rotation },
    body,
  })
describe('private app-owned revision transformer', () => {
  it('requires POST before acquiring transform capacity', async () => {
    const acquire = vi.fn(),
      transform = vi.fn()
    const response = await handleRevisionTransform(
      new Request('https://private.test/?t=w_100'),
      transform,
      acquire,
    )
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    expect(acquire).not.toHaveBeenCalled()
  })
  it('passes exact bytes, retained rotation and bounded options to the existing pipeline', async () => {
    const release = vi.fn(),
      transform = vi.fn(async () => ({ body: bytes, contentType: 'image/webp' }))
    const response = await handleRevisionTransform(request(), transform, () => release)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-image-transform-provider')).toBe('local')
    expect(transform).toHaveBeenCalledWith(
      bytes,
      'image/png',
      expect.objectContaining({ renderRotation: 90, width: 100, cropMode: 'c_fit' }),
    )
    expect(release).toHaveBeenCalledOnce()
  })
  it.each([
    't=c_fit,w_2049',
    't=w_0',
    't=c_fill,c_fit,w_40',
    't=w_40,w_50',
    't=w_10&quality=101',
    't=w_10&format=svg',
  ])('rejects invalid transforms before reading or decoding: %s', async query => {
    const acquire = vi.fn(),
      transform = vi.fn()
    expect(
      (await handleRevisionTransform(request(query), transform, acquire)).status,
    ).toBe(400)
    expect(acquire).not.toHaveBeenCalled()
    expect(transform).not.toHaveBeenCalled()
  })
  it('keeps limit mode from enlarging images and preserves single-dimension fit', () => {
    expect(
      parseRevisionTransformOptions(new URL('https://private/?t=c_limit,w_100')),
    ).toMatchObject({ withoutEnlargement: true, width: 100, height: undefined })
  })
  it('enforces byte bounds independently of Content-Length and releases capacity', async () => {
    const release = vi.fn(),
      transform = vi.fn()
    const response = await handleRevisionTransform(
      request('t=w_100', '0', new Uint8Array(20 * 1024 * 1024 + 1)),
      transform,
      () => release,
    )
    expect(response.status).toBe(413)
    expect(transform).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })
  it('rejects untrusted rotation, unsupported media and saturation without invoking a fallback', async () => {
    const transform = vi.fn(),
      release = vi.fn()
    expect(
      (
        await handleRevisionTransform(
          request('t=w_100', '45'),
          transform,
          () => release,
        )
      ).status,
    ).toBe(400)
    const svg = request()
    svg.headers.set('content-type', 'image/svg+xml')
    expect((await handleRevisionTransform(svg, transform, () => release)).status).toBe(
      415,
    )
    expect(
      (await handleRevisionTransform(request(), transform, () => null)).status,
    ).toBe(503)
    expect(transform).not.toHaveBeenCalled()
  })
  it('releases capacity after codec failure', async () => {
    const release = vi.fn()
    expect(
      (
        await handleRevisionTransform(
          request(),
          async () => {
            throw new Error('decode')
          },
          () => release,
        )
      ).status,
    ).toBe(415)
    expect(release).toHaveBeenCalledOnce()
  })
  it.each([false, true])(
    'bounds capacity retries and preserves exact input (always busy: %s)',
    async alwaysBusy => {
      vi.useFakeTimers()
      try {
        const fetch = vi.fn(async () =>
          alwaysBusy || fetch.mock.calls.length === 1
            ? new Response('Transformer busy', {
                status: 503,
                headers: { 'retry-after': '2' },
              })
            : new Response(bytes, { headers: { 'content-type': 'image/webp' } }),
        )
        const pending = transformImageRevision(
          { fetch } as unknown as Parameters<typeof transformImageRevision>[0],
          bytes,
          'image/png',
          { renderRotation: 90 },
          new URL('https://private/?t=w_100'),
        )
        const checked = alwaysBusy
          ? expect(pending).rejects.toMatchObject({ status: 503 })
          : expect(pending).resolves.toMatchObject({ status: 200 })
        await vi.runAllTimersAsync()
        await checked
        expect(fetch).toHaveBeenCalledTimes(alwaysBusy ? 3 : 2)
        for (const call of fetch.mock.calls)
          expect(call).toEqual([
            'https://revision-transform.internal/?t=w_100',
            expect.objectContaining({
              body: bytes,
              headers: {
                'content-type': 'image/png',
                'x-revision-render-rotation': '90',
              },
            }),
          ])
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it('delivers originals without a service and fails explicitly if a transform service is unavailable', async () => {
    expect(
      await transformImageRevision(
        undefined,
        bytes,
        'image/png',
        {},
        new URL('https://private/'),
      ),
    ).toBeNull()
    await expect(
      transformImageRevision(
        undefined,
        bytes,
        'image/png',
        {},
        new URL('https://private/?t=w_100'),
      ),
    ).rejects.toMatchObject({ status: 503 })
  })
})
