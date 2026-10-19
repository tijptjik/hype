import { describe, expect, it, vi } from 'vitest'
import {
  buildPlatformAnalyticsQuery,
  fetchPlatformAnalytics,
} from '../lib/api/services/platformAnalytics'

const config = {
  facet: 'views' as const,
  hostname: 'breadline.hk',
  hosts: ['breadline.hk'],
  accountId: 'account',
  token: 'private-token',
  now: new Date('2026-10-19T12:00:00Z'),
}

describe('platform analytics', () => {
  it('restricts queries to an authorized host and a common rolling cutoff', () => {
    const query = buildPlatformAnalyticsQuery(config, '1h')
    expect(query).toContain('requestHost:"breadline.hk"')
    expect(query).toContain('datetime_geq:"2026-10-19T11:00:00.000Z"')
    expect(query).toContain('datetime_lt:"2026-10-19T12:00:00.000Z"')
    expect(query.match(/\{/g)?.length).toBe(query.match(/\}/g)?.length)
    expect(query).not.toContain(config.token)
  })

  it('does not fetch unauthorized hosts or missing credentials', async () => {
    const fetcher = vi.fn()
    expect(
      (await fetchPlatformAnalytics({ ...config, hostname: 'other.hk', fetcher }))
        .status,
    ).toBe('error')
    expect(
      (await fetchPlatformAnalytics({ ...config, token: undefined, fetcher })).status,
    ).toBe('error')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('scopes operational queries to configured Hype resources', () => {
    const query = buildPlatformAnalyticsQuery(
      {
        ...config,
        facet: 'data',
        databaseId: 'hype-db',
        queueIds: ['asset-queue', 'map-queue'],
      },
      '30d',
    )
    expect(query).toContain('databaseId:"hype-db"')
    expect(query).toContain('queueId_in:["asset-queue","map-queue"]')
    expect(query).toContain('queryBatchTimeMsP99')
    expect(query).toContain('dimensions{date}')
  })

  it('preserves successful sections and hides raw upstream errors', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: {
          viewer: {
            accounts: [
              {
                totals: [{ count: 42, sum: { visits: 12 } }],
                paths: [{ count: 20, dimensions: { requestPath: '/map' } }],
                referrers: null,
                hosts: [],
                timeline: [],
              },
            ],
          },
        },
        errors: [{ message: 'private upstream details' }],
      }),
    ) as unknown as typeof fetch
    const result = await fetchPlatformAnalytics({ ...config, fetcher })
    expect(result.status).toBe('success')
    if (result.status !== 'success') return
    expect(result.data.windows['24h'].metrics[0].value).toBe(42)
    expect(result.data.windows['24h'].rankings[0].rows[0].label).toBe('/map')
    expect(result.data.windows['24h'].rankings[1].error).toBeTruthy()
    expect(JSON.stringify(result)).not.toContain('private upstream details')
  })

  it('isolates a failed window and distinguishes empty data from failure', async () => {
    const fetcher = vi.fn(async (_url, init) => {
      if (String(init?.body).includes('2026-10-19T11:00:00.000Z'))
        throw new Error('offline')
      return Response.json({
        data: {
          viewer: {
            accounts: [
              { totals: [], paths: [], referrers: [], hosts: [], timeline: [] },
            ],
          },
        },
      })
    }) as unknown as typeof fetch
    const result = await fetchPlatformAnalytics({ ...config, fetcher })
    if (result.status !== 'success') throw new Error('Expected summary')
    expect(result.data.windows['1h'].error).toBeTruthy()
    expect(result.data.windows['24h'].metrics[0].value).toBe(0)
    expect(result.data.windows['24h'].error).toBeUndefined()
  })
})
