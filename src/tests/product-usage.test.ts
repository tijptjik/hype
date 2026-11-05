// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ProductUsageObserver } from '#lib/analytics/clientProductUsage.js'
import {
  recordProductUsage,
  recordTaskContribution,
} from '#lib/analytics/productUsage.server.js'
import {
  buildProductAnalyticsQuery,
  fetchProductAnalytics,
} from '#lib/api/services/productAnalytics.js'
import { POST } from '../routes/api/analytics/+server'
import type { ClientUsage } from '#lib/analytics/productUsage.js'

describe('product usage', () => {
  it('writes a stable, bounded contract and tolerates unavailable telemetry', () => {
    const writeDataPoint = vi.fn()
    const input = {
      event: 'feature.view',
      entityId: 'feature-1',
      source: 'client',
      hubId: 'core',
    } as const
    recordProductUsage({ writeDataPoint }, input, 'production')
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['feature.view'],
      blobs: ['v1', 'feature.view', 'client', 'core', 'feature-1'],
      doubles: [1],
    })
    recordProductUsage(
      { writeDataPoint },
      { ...input, entityId: 'email@example.com' },
      'production',
    )
    expect(writeDataPoint).toHaveBeenCalledTimes(1)
    expect(() => recordProductUsage(undefined, input, 'production')).not.toThrow()
    expect(() =>
      recordProductUsage(
        {
          writeDataPoint: () => {
            throw new Error('offline')
          },
        },
        input,
        'production',
      ),
    ).not.toThrow()
  })

  it.each(['local', 'preview', undefined])(
    'never writes from %s even with a binding',
    environment => {
      const writeDataPoint = vi.fn()
      recordProductUsage(
        { writeDataPoint },
        { event: 'feature.view', entityId: 'feature', source: 'client' },
        environment,
      )
      expect(writeDataPoint).not.toHaveBeenCalled()
    },
  )

  it('counts visible transitions without duplicating refreshes, reordered layers or draft changes', () => {
    const events: ClientUsage[] = []
    const observer = new ProductUsageObserver(event => events.push(event))
    const snapshot = {
      hubId: 'hub',
      featureId: 'f',
      layers: ['a', 'b'],
      projects: ['p'],
    }
    observer.sync(snapshot)
    observer.sync({ ...snapshot, layers: ['b', 'a', 'a'] })
    expect(events).toHaveLength(4)
    observer.sync({ ...snapshot, featureId: null, layers: ['b'], projects: [] })
    observer.sync(snapshot)
    expect(events.slice(4)).toEqual([
      { event: 'feature.view', entityId: 'f' },
      { event: 'layer.activate', entityId: 'a' },
      { event: 'project.filter', entityId: 'p' },
    ])
  })

  it('maps submitted tasks to distinct server contribution categories', () => {
    const writeDataPoint = vi.fn()
    const locals = {
      platform: {
        env: { ENVIRONMENT: 'production', PRODUCT_USAGE: { writeDataPoint } },
      },
      hub: { id: 'hub' },
    } as unknown as App.Locals
    for (const type of ['newFeature', 'reportedMissing', 'newPhoto', 'unsupported'])
      recordTaskContribution(locals, { id: 'task', type })
    expect(writeDataPoint.mock.calls.map(([point]) => point.blobs[1])).toEqual([
      'contribution.new_feature',
      'contribution.missing_report',
      'contribution.photos',
    ])
  })

  it('rejects cross-origin, oversized, malformed and forged contribution payloads', async () => {
    const writeDataPoint = vi.fn()
    const send = async (body: string, origin = 'https://hype.hk') =>
      POST({
        request: new Request('https://hype.hk/api/analytics', {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body,
        }),
        url: new URL('https://hype.hk/api/analytics'),
        locals: {
          platform: {
            env: { ENVIRONMENT: 'production', PRODUCT_USAGE: { writeDataPoint } },
          },
          hub: { id: 'hub' },
        },
      } as unknown as Parameters<typeof POST>[0])
    const valid = JSON.stringify({ event: 'feature.view', entityId: 'feature' })
    expect((await send(valid, 'https://evil.example')).status).toBe(403)
    expect((await send(' '.repeat(1025))).status).toBe(413)
    for (const body of [
      'null',
      '[1]',
      '{',
      JSON.stringify({ event: 'contribution.new_feature', entityId: 'feature' }),
      JSON.stringify({ event: 'feature.view', entityId: 'feature', userId: 'user' }),
    ])
      expect((await send(body)).status).toBe(400)
    expect(writeDataPoint).not.toHaveBeenCalled()
    expect((await send(valid)).status).toBe(204)
    expect(writeDataPoint.mock.calls[0][0].blobs).toEqual([
      'v1',
      'feature.view',
      'client',
      'hub',
      'feature',
    ])
  })

  it('weights samples and queries complete event totals separately from rankings', async () => {
    expect(
      buildProductAnalyticsQuery('hype_product_usage_production', false),
    ).toContain('SUM(_sample_interval * double1)')
    expect(() => buildProductAnalyticsQuery('dataset; DROP TABLE user', true)).toThrow()
    const config = {
      PRODUCT_USAGE_DATASET: 'hype_product_usage_production',
      PRODUCT_USAGE_READ_TOKEN: 'test',
      CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
      ENVIRONMENT: 'preview',
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ data: [] })))
    fetcher.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ data: [{ event: 'feature.view', count: '23' }] }),
        ),
    )
    const result = await fetchProductAnalytics(config, fetcher)
    expect(result).toMatchObject({
      status: 'success',
      environment: 'production',
      totals: [{ count: 23 }],
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][1]?.body).not.toContain('GROUP BY blob2, blob5')
    expect(fetcher.mock.calls[1][1]?.body).toContain('GROUP BY blob2, blob5')
    expect(
      await fetchProductAnalytics(
        { ...config, PRODUCT_USAGE_READ_TOKEN: undefined },
        fetcher,
      ),
    ).toMatchObject({ status: 'unconfigured' })
    fetcher.mockResolvedValue(new Response(null, { status: 403 }))
    expect(await fetchProductAnalytics(config, fetcher)).toMatchObject({
      status: 'error',
    })
  })
})
