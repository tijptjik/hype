import { fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AssetAnalyticsDashboard from '$lib/bits/patterns/analytics/assetAnalyticsDashboard/AssetAnalyticsDashboard.svelte'
import type {
  AssetAnalyticsSummaryResult,
  AssetAnalyticsSummaryWindow,
} from '$lib/types'

const getWindowToggleButtons = (label: string): HTMLButtonElement[] =>
  screen.getAllByRole('button', { name: `Last ${label}` }) as HTMLButtonElement[]

afterEach(() => {
  document.body.innerHTML = ''
})

beforeEach(() => {
  vi.useRealTimers()
})

function createWindow(
  overrides: Partial<AssetAnalyticsSummaryWindow> = {},
): AssetAnalyticsSummaryWindow {
  return {
    totalRequests: 0,
    cacheHitPercent: 0,
    derivedHitPercent: 0,
    derivedMissPercent: 0,
    notFoundPercent: 0,
    serverErrorPercent: 0,
    p50Ms: {
      cache: null,
      derivedHit: null,
      derivedMiss: null,
      notFound: null,
      serverError: null,
    },
    p95Ms: {
      cache: null,
      derivedHit: null,
      derivedMiss: null,
      notFound: null,
      serverError: null,
    },
    p99Ms: {
      cache: null,
      derivedHit: null,
      derivedMiss: null,
      notFound: null,
      serverError: null,
    },
    timeseries30d: [],
    breakdowns: {
      cropModes: [],
      formats: [],
      dimensions: [],
      qualities: [],
      gravities: [],
    },
    topTransformations: [],
    topImages: [],
    topMissingImages: [],
    topServerErrorImages: [],
    ...overrides,
  }
}

describe('AssetAnalyticsDashboard', () => {
  it('renders a populated analytics summary', () => {
    const state = {
      status: 'success',
      data: {
        environment: 'preview',
        generatedAt: '2026-03-24T12:00:00.000Z',
        windows: {
          '1h': null,
          '24h': createWindow({
            totalRequests: 1824,
            cacheHitPercent: 71.2,
            derivedHitPercent: 18.5,
            derivedMissPercent: 10.3,
            notFoundPercent: 0,
            p95Ms: {
              cache: 22,
              derivedHit: 118,
              derivedMiss: 486,
              notFound: null,
              serverError: null,
            },
            topTransformations: [
              { transformKey: 'w=1200,h=630,fit=cover', requests: 120 },
            ],
            topImages: [
              { publicId: 'ghostmappers/hkghostsigns/example', requests: 88 },
            ],
          }),
          '7d': createWindow({
            totalRequests: 9124,
            cacheHitPercent: 69.1,
            derivedHitPercent: 20.2,
            derivedMissPercent: 10.7,
            notFoundPercent: 0,
            p50Ms: {
              cache: 9,
              derivedHit: 58,
              derivedMiss: 201,
              notFound: null,
              serverError: null,
            },
            p95Ms: {
              cache: 26,
              derivedHit: 140,
              derivedMiss: 512,
              notFound: null,
              serverError: null,
            },
            p99Ms: {
              cache: 40,
              derivedHit: 220,
              derivedMiss: 820,
              notFound: null,
              serverError: null,
            },
          }),
          '30d': createWindow({
            totalRequests: 40124,
            cacheHitPercent: 67.4,
            derivedHitPercent: 21.9,
            derivedMissPercent: 10.7,
            notFoundPercent: 0,
            p50Ms: {
              cache: 11,
              derivedHit: 63,
              derivedMiss: 219,
              notFound: null,
              serverError: null,
            },
            p95Ms: {
              cache: 28,
              derivedHit: 154,
              derivedMiss: 533,
              notFound: null,
              serverError: null,
            },
            p99Ms: {
              cache: 43,
              derivedHit: 231,
              derivedMiss: 860,
              notFound: null,
              serverError: null,
            },
          }),
        },
        windowErrors: {},
      },
    } satisfies AssetAnalyticsSummaryResult

    render(AssetAnalyticsDashboard, {
      props: { state },
    })

    expect(screen.getByRole('heading', { name: 'Asset delivery' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Cache & Latency' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Leaders' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Failures' })).toBeTruthy()
    expect(screen.getAllByText('1,824').length).toBeGreaterThan(0)
    expect(screen.getByText('ghostmappers/hkghostsigns/example')).toBeTruthy()
    expect(screen.getByText('Cover')).toBeTruthy()
    expect(screen.getByText('1200x630')).toBeTruthy()
  })

  it('defaults the visible windows to 1h, 24h, and 30d', () => {
    const state = {
      status: 'success',
      data: {
        environment: 'production',
        generatedAt: '2026-03-24T12:00:00.000Z',
        windows: {
          '1h': null,
          '24h': createWindow({
            totalRequests: 10,
            cacheHitPercent: 50,
            derivedHitPercent: 30,
            derivedMissPercent: 20,
            p95Ms: {
              cache: 20,
              derivedHit: 40,
              derivedMiss: 60,
              notFound: null,
              serverError: null,
            },
          }),
          '7d': createWindow({
            totalRequests: 20,
            cacheHitPercent: 60,
            derivedHitPercent: 25,
            derivedMissPercent: 15,
            p95Ms: {
              cache: 25,
              derivedHit: 45,
              derivedMiss: 65,
              notFound: null,
              serverError: null,
            },
          }),
          '30d': createWindow({
            totalRequests: 30,
            cacheHitPercent: 70,
            derivedHitPercent: 20,
            derivedMissPercent: 10,
            p95Ms: {
              cache: 30,
              derivedHit: 50,
              derivedMiss: 70,
              notFound: null,
              serverError: null,
            },
          }),
        },
        windowErrors: {},
      },
    } satisfies AssetAnalyticsSummaryResult

    render(AssetAnalyticsDashboard, {
      props: { state },
    })

    expect(
      getWindowToggleButtons('1h').every(button => button.ariaPressed === 'true'),
    ).toBe(true)
    expect(
      getWindowToggleButtons('24h').every(button => button.ariaPressed === 'true'),
    ).toBe(true)
    expect(
      getWindowToggleButtons('30d').every(button => button.ariaPressed === 'true'),
    ).toBe(true)
    expect(
      getWindowToggleButtons('7d').every(button => button.ariaPressed === 'false'),
    ).toBe(true)
  })

  it('allows selecting all four windows', async () => {
    const state = {
      status: 'success',
      data: {
        environment: 'production',
        generatedAt: '2026-03-24T12:00:00.000Z',
        windows: {
          '1h': null,
          '24h': createWindow({
            totalRequests: 10,
            cacheHitPercent: 50,
            derivedHitPercent: 30,
            derivedMissPercent: 20,
            p95Ms: {
              cache: 20,
              derivedHit: 40,
              derivedMiss: 60,
              notFound: null,
              serverError: null,
            },
          }),
          '7d': createWindow({
            totalRequests: 20,
            cacheHitPercent: 60,
            derivedHitPercent: 25,
            derivedMissPercent: 15,
            p95Ms: {
              cache: 25,
              derivedHit: 45,
              derivedMiss: 65,
              notFound: null,
              serverError: null,
            },
          }),
          '30d': createWindow({
            totalRequests: 30,
            cacheHitPercent: 70,
            derivedHitPercent: 20,
            derivedMissPercent: 10,
            p95Ms: {
              cache: 30,
              derivedHit: 50,
              derivedMiss: 70,
              notFound: null,
              serverError: null,
            },
          }),
        },
        windowErrors: {},
      },
    } satisfies AssetAnalyticsSummaryResult

    render(AssetAnalyticsDashboard, {
      props: { state },
    })

    await fireEvent.click(getWindowToggleButtons('7d')[0])

    expect(
      getWindowToggleButtons('7d').every(button => button.ariaPressed === 'true'),
    ).toBe(true)
    expect(screen.getAllByText('7d').length).toBeGreaterThan(0)
  })

  it('renders an empty state when all windows are deselected', async () => {
    const state = {
      status: 'success',
      data: {
        environment: 'production',
        generatedAt: '2026-03-24T12:00:00.000Z',
        windows: {
          '1h': null,
          '24h': createWindow({
            totalRequests: 10,
            cacheHitPercent: 50,
            derivedHitPercent: 30,
            derivedMissPercent: 20,
            p95Ms: {
              cache: 20,
              derivedHit: 40,
              derivedMiss: 60,
              notFound: null,
              serverError: null,
            },
          }),
          '7d': createWindow({
            totalRequests: 20,
            cacheHitPercent: 60,
            derivedHitPercent: 25,
            derivedMissPercent: 15,
            p95Ms: {
              cache: 25,
              derivedHit: 45,
              derivedMiss: 65,
              notFound: null,
              serverError: null,
            },
          }),
          '30d': createWindow({
            totalRequests: 30,
            cacheHitPercent: 70,
            derivedHitPercent: 20,
            derivedMissPercent: 10,
            p95Ms: {
              cache: 30,
              derivedHit: 50,
              derivedMiss: 70,
              notFound: null,
              serverError: null,
            },
          }),
        },
        windowErrors: {},
      },
    } satisfies AssetAnalyticsSummaryResult

    render(AssetAnalyticsDashboard, {
      props: { state },
    })

    await fireEvent.click(getWindowToggleButtons('1h')[0])
    await fireEvent.click(getWindowToggleButtons('24h')[0])
    await fireEvent.click(getWindowToggleButtons('30d')[0])

    expect(screen.getAllByText('No time dimensions selected')).toHaveLength(3)
  })

  it('renders the error state', () => {
    render(AssetAnalyticsDashboard, {
      props: {
        state: {
          status: 'error',
          message: 'Asset analytics request failed with 500 Internal Server Error.',
        },
      },
    })

    expect(screen.getByText('Analytics unavailable')).toBeTruthy()
    expect(
      screen.getByText(
        'Asset analytics request failed with 500 Internal Server Error.',
      ),
    ).toBeTruthy()
  })

  it('surfaces partial window failures while keeping successful windows visible', () => {
    const state = {
      status: 'success',
      data: {
        environment: 'production',
        generatedAt: '2026-03-24T12:00:00.000Z',
        windows: {
          '1h': null,
          '24h': createWindow({
            totalRequests: 1824,
            cacheHitPercent: 71.2,
            derivedHitPercent: 18.5,
            derivedMissPercent: 10.3,
            p95Ms: {
              cache: 22,
              derivedHit: 118,
              derivedMiss: 486,
              notFound: null,
              serverError: null,
            },
          }),
          '7d': null,
          '30d': createWindow({
            totalRequests: 40124,
            cacheHitPercent: 67.4,
            derivedHitPercent: 21.9,
            derivedMissPercent: 10.7,
            p50Ms: {
              cache: 11,
              derivedHit: 63,
              derivedMiss: 219,
              notFound: null,
              serverError: null,
            },
            p95Ms: {
              cache: 28,
              derivedHit: 154,
              derivedMiss: 533,
              notFound: null,
              serverError: null,
            },
            p99Ms: {
              cache: 43,
              derivedHit: 231,
              derivedMiss: 860,
              notFound: null,
              serverError: null,
            },
          }),
        },
        windowErrors: {
          '1h': '1h query failed upstream',
          '7d': '7d query failed upstream',
        },
      },
    } satisfies AssetAnalyticsSummaryResult

    render(AssetAnalyticsDashboard, {
      props: { state },
    })

    expect(screen.getByText('Partial analytics data')).toBeTruthy()
    expect(screen.getByText(/1h:/)).toBeTruthy()
    expect(screen.getByText(/7d:/)).toBeTruthy()
    expect(screen.getAllByText('24h').length).toBeGreaterThan(0)
    expect(screen.getAllByText('30d').length).toBeGreaterThan(0)
  })

  it('toggles 404 series and recomputes visible percentages', async () => {
    const state = {
      status: 'success',
      data: {
        environment: 'production',
        generatedAt: '2026-03-24T12:00:00.000Z',
        windows: {
          '1h': null,
          '24h': createWindow({
            totalRequests: 100,
            cacheHitPercent: 50,
            derivedHitPercent: 25,
            derivedMissPercent: 15,
            notFoundPercent: 10,
            serverErrorPercent: 5,
            p95Ms: {
              cache: 20,
              derivedHit: 40,
              derivedMiss: 60,
              notFound: 12,
              serverError: 18,
            },
            topMissingImages: [
              { publicId: 'ghostmappers/hkghostsigns/missing', requests: 10 },
            ],
            topServerErrorImages: [
              { publicId: 'ghostmappers/hkghostsigns/error', requests: 5 },
            ],
          }),
          '7d': createWindow(),
          '30d': createWindow({
            timeseries30d: [
              {
                date: '2026-03-01',
                totalRequests: 100,
                cacheRequests: 50,
                derivedHitRequests: 25,
                derivedMissRequests: 15,
                notFoundRequests: 10,
                serverErrorRequests: 5,
              },
            ],
          }),
        },
        windowErrors: {},
      },
    } satisfies AssetAnalyticsSummaryResult

    render(AssetAnalyticsDashboard, {
      props: { state },
    })

    expect(screen.getAllByText('404 %').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5xx %').length).toBeGreaterThan(0)
    expect(screen.getByText('404 not found')).toBeTruthy()
    expect(screen.getByText('5xx error')).toBeTruthy()

    const cacheToggle = screen.getAllByRole('button', { name: 'Cache' })[0]
    await fireEvent.click(cacheToggle)

    expect(cacheToggle.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('404 not found')).toBeTruthy()
    expect(screen.getByText('ghostmappers/hkghostsigns/missing')).toBeTruthy()
    expect(screen.getAllByText('5xx assets').length).toBeGreaterThan(0)
    expect(screen.getByText('ghostmappers/hkghostsigns/error')).toBeTruthy()
  })
})
