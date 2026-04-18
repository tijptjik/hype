import { describe, expect, it } from 'vitest'
import {
  fetchAssetAnalyticsSummary,
  resolveAssetAnalyticsConfig,
  toAssetAnalyticsSummary,
} from '$lib/api/services/analytics'

describe('asset analytics server helper', () => {
  it('normalizes fixed windows and nullable latency buckets from the worker payload', () => {
    const summary = toAssetAnalyticsSummary({
      environment: 'preview',
      generatedAt: '2026-03-24T12:00:00.000Z',
      windows: {
        '24h': {
          totalRequests: 1824,
          cacheHitPercent: 71.25,
          derivedHitPercent: 18.5,
          derivedMissPercent: 10.25,
          notFoundPercent: 2.75,
          serverErrorPercent: 1.5,
          p95Ms: {
            cache: 22,
            derivedHit: 118,
            derivedMiss: 486,
            notFound: 31,
            serverError: 54,
          },
          topTransformations: [
            {
              transformKey: 'w=1200,h=630,fit=cover',
              requests: 120,
            },
          ],
          topImages: [
            {
              publicId: 'ghostmappers/hkghostsigns/example',
              requests: 88,
            },
          ],
          topMissingImages: [
            {
              publicId: 'ghostmappers/hkghostsigns/missing-example',
              requests: 5,
            },
          ],
          topServerErrorImages: [
            {
              publicId: 'ghostmappers/hkghostsigns/error-example',
              requests: 2,
            },
          ],
        },
      },
      windowErrors: {
        '1h': '1h query timed out',
      },
    })

    expect(summary.windows['1h']).toBeNull()
    expect(summary.windowErrors['1h']).toBe('1h query timed out')
    expect(summary.windows['24h']?.p50Ms).toEqual({
      cache: null,
      derivedHit: null,
      derivedMiss: null,
      notFound: null,
      serverError: null,
    })
    expect(summary.windows['24h']?.p95Ms.derivedMiss).toBe(486)
    expect(summary.windows['24h']?.p95Ms.notFound).toBe(31)
    expect(summary.windows['24h']?.p95Ms.serverError).toBe(54)
    expect(summary.windows['24h']?.notFoundPercent).toBe(2.75)
    expect(summary.windows['24h']?.serverErrorPercent).toBe(1.5)
    expect(summary.windows['24h']?.topImages[0]?.publicId).toBe(
      'ghostmappers/hkghostsigns/example',
    )
    expect(summary.windows['24h']?.topMissingImages[0]?.publicId).toBe(
      'ghostmappers/hkghostsigns/missing-example',
    )
    expect(summary.windows['24h']?.topServerErrorImages[0]?.publicId).toBe(
      'ghostmappers/hkghostsigns/error-example',
    )
  })

  it('accepts legacy payloads that emit explicit null latency values', () => {
    const summary = toAssetAnalyticsSummary({
      environment: 'production',
      generatedAt: '2026-03-26T04:00:00.000Z',
      windows: {
        '24h': {
          totalRequests: 100,
          cacheHitPercent: 50,
          derivedHitPercent: 25,
          derivedMissPercent: 25,
          serverErrorPercent: 5,
          p95Ms: {
            cache: 20,
            derivedHit: null,
            derivedMiss: null,
            notFound: null,
            serverError: null,
          },
        },
      },
    })

    expect(summary.windows['24h']?.p95Ms).toEqual({
      cache: 20,
      derivedHit: null,
      derivedMiss: null,
      notFound: null,
      serverError: null,
    })
  })

  it('fails closed when the endpoint or token is missing', async () => {
    const result = await fetchAssetAnalyticsSummary({
      baseUrl: '',
      readToken: '',
    })

    expect(result).toEqual({
      status: 'error',
      message:
        'Asset analytics is unavailable because PUBLIC_ASSET_BASE_URL or ASSET_ANALYTICS_READ_TOKEN is not configured.',
    })
  })

  it('pins local analytics reads to production and falls back to private env tokens', () => {
    expect(
      resolveAssetAnalyticsConfig({
        environment: 'local',
        baseUrl: 'https://assets.preview.hype.hk',
        readToken: '',
        privateReadToken: 'server-token',
      }),
    ).toEqual({
      baseUrl: 'https://assets.hype.hk',
      readToken: 'server-token',
    })
  })

  it('pins preview analytics reads to production', () => {
    expect(
      resolveAssetAnalyticsConfig({
        environment: 'preview',
        baseUrl: 'https://assets.preview.hype.hk',
        readToken: 'preview-token',
      }),
    ).toEqual({
      baseUrl: 'https://assets.hype.hk',
      readToken: 'preview-token',
    })
  })

  it('returns an error summary when every analytics window fails upstream', async () => {
    const result = await fetchAssetAnalyticsSummary({
      baseUrl: 'https://assets.hype.hk',
      readToken: 'token',
      fetcher: async () =>
        new Response(
          JSON.stringify({
            environment: 'production',
            generatedAt: '2026-03-24T12:00:00.000Z',
            windows: {},
            windowErrors: {
              '1h': '1h query failed',
              '24h': '24h query failed',
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ) as Response,
    })

    expect(result).toEqual({
      status: 'error',
      message:
        'Asset analytics windows failed: 1h: 1h query failed | 24h: 24h query failed',
    })
  })

  it('forwards explicit scope prefixes to the analytics worker', async () => {
    let requestedUrl = ''

    await fetchAssetAnalyticsSummary({
      baseUrl: 'https://assets.hype.hk',
      readToken: 'token',
      scopePrefixes: ['h/ghostmappers/', 'h/ghostmappers/hkghostsigns/'],
      fetcher: async input => {
        requestedUrl = String(input)

        return new Response(
          JSON.stringify({
            environment: 'production',
            generatedAt: '2026-03-24T12:00:00.000Z',
            windows: {
              '24h': {
                totalRequests: 10,
                cacheHitPercent: 50,
                derivedHitPercent: 25,
                derivedMissPercent: 25,
                notFoundPercent: 0,
                serverErrorPercent: 0,
              },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ) as Response
      },
    })

    const url = new URL(requestedUrl)
    expect(url.searchParams.getAll('scopePrefix')).toEqual([
      'h/ghostmappers/',
      'h/ghostmappers/hkghostsigns/',
    ])
  })
})
