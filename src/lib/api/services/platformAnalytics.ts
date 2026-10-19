// THIRD PARTY
import { z } from 'zod'
// TYPES
import type { AssetAnalyticsWindowKey } from './assetAnalytics.types'
import type {
  AnalyticsRanking,
  PlatformAnalyticsFacet,
  PlatformAnalyticsResult,
  PlatformAnalyticsWindow,
} from './platformAnalytics.types'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. QUERY CONTRACT
// - buildPlatformAnalyticsQuery
// 2. FETCH AND NORMALIZATION
// - fetchPlatformAnalytics
// - readWindow
// ---

/********************
 *  1. QUERY CONTRACT
 ************/
// +++ Query Contract

const WINDOWS = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 } as const
const rowSchema = z.object({
  count: z.number().nonnegative().optional(),
  sum: z.record(z.string(), z.number()).optional(),
  avg: z.record(z.string(), z.number().nullable()).optional(),
  quantiles: z.record(z.string(), z.number().nullable()).optional(),
  dimensions: z.record(z.string(), z.string()).optional(),
})
const responseSchema = z.object({
  data: z
    .object({
      viewer: z
        .object({
          accounts: z
            .array(z.record(z.string(), z.array(rowSchema).nullable()))
            .nullable(),
        })
        .nullable(),
    })
    .nullable()
    .optional(),
  errors: z
    .array(z.object({ message: z.string() }))
    .nullable()
    .optional(),
})
type Row = z.infer<typeof rowSchema>
type Config = {
  accountId?: string
  token?: string
  databaseId?: string
  queueIds?: string[]
  facet: PlatformAnalyticsFacet
  hostname: string
  hosts: string[]
  now?: Date
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>
}
const TRAFFIC_DIMENSIONS = {
  views: [
    ['paths', 'Paths', 'requestPath'],
    ['referrers', 'Referrers', 'refererHost'],
    ['hosts', 'Hosts', 'requestHost'],
  ],
  audience: [
    ['countries', 'Countries', 'countryName'],
    ['browsers', 'Browsers', 'userAgentBrowser'],
    ['devices', 'Devices', 'deviceType'],
    ['systems', 'Operating systems', 'userAgentOS'],
  ],
} as const

/**
 * Builds fixed-window queries using JSON-escaped server-authorized identifiers.
 * @param config - Authorized host or operational resource configuration.
 * @param window - Rolling window key.
 * @returns Cloudflare GraphQL document.
 */
export function buildPlatformAnalyticsQuery(
  config: Config,
  window: AssetAnalyticsWindowKey,
): string {
  const end = config.now ?? new Date()
  const start = new Date(end.getTime() - WINDOWS[window] * 3600000)
  const period = `datetime_geq:${JSON.stringify(start.toISOString())},datetime_lt:${JSON.stringify(end.toISOString())}`
  let fields: string[]
  if (config.facet === 'data') {
    const filter = `${period},databaseId:${JSON.stringify(config.databaseId)}`
    const sum =
      'sum { readQueries writeQueries rowsRead rowsWritten queryBatchResponseBytes }'
    fields = [
      `totals:d1AnalyticsAdaptiveGroups(limit:1,filter:{${filter}}){count ${sum} avg{queryBatchTimeMs} quantiles{queryBatchTimeMsP50 queryBatchTimeMsP95 queryBatchTimeMsP99}}`,
      `regions:d1AnalyticsAdaptiveGroups(limit:25,filter:{${filter}},orderBy:[sum_rowsRead_DESC]){${sum} dimensions{servedByRegion}}`,
    ]
    if (window === '30d')
      fields.push(
        `timeline:d1AnalyticsAdaptiveGroups(limit:32,filter:{${filter}},orderBy:[date_ASC]){${sum} dimensions{date}}`,
      )
    if (config.queueIds?.length)
      fields.push(
        `queues:queueMessageOperationsAdaptiveGroups(limit:100,filter:{${period},queueId_in:${JSON.stringify(config.queueIds)}}){count dimensions{queueId actionType outcome} avg{lagTime retryCount}}`,
      )
  } else {
    const filter = `${period},requestHost:${JSON.stringify(config.hostname)}`
    fields = [
      `totals:rumPageloadEventsAdaptiveGroups(limit:1,filter:{${filter}}){count sum{visits}}`,
    ]
    for (const [alias, , dimension] of TRAFFIC_DIMENSIONS[config.facet]) {
      fields.push(
        `${alias}:rumPageloadEventsAdaptiveGroups(limit:25,filter:{${filter}},orderBy:[count_DESC]){count dimensions{${dimension}}}`,
      )
    }
    if (window === '30d')
      fields.push(
        `timeline:rumPageloadEventsAdaptiveGroups(limit:32,filter:{${filter}},orderBy:[date_ASC]){count dimensions{date}}`,
      )
  }
  return `{viewer{accounts(filter:{accountTag:${JSON.stringify(config.accountId)}}){${fields.join('\n')}}}}`
}

// ---
/********************
 *  2. FETCH AND NORMALIZATION
 ************/
// +++ Fetch And Normalization

/**
 * Reads four independent windows, retaining successful sections on partial failures.
 * @param config - Server-only credentials and authorized resource scope.
 * @returns Browser-safe metrics without credentials or upstream error details.
 * @remarks Traffic counts are sampled page loads, not unique people. Queue counts are operations, not backlog.
 */
export async function fetchPlatformAnalytics(
  config: Config,
): Promise<PlatformAnalyticsResult> {
  if (!config.accountId || !config.token)
    return {
      status: 'error',
      message: 'Cloudflare analytics credentials are not configured.',
    }
  if (config.facet === 'data' && !config.databaseId)
    return { status: 'error', message: 'The analytics database is not configured.' }
  if (config.facet !== 'data' && !config.hosts.includes(config.hostname))
    return {
      status: 'error',
      message: 'No authorized production hostname is available.',
    }
  const now = config.now ?? new Date()
  const windows = {} as Record<AssetAnalyticsWindowKey, PlatformAnalyticsWindow>
  // Bound concurrency to four fixed windows and preserve a common snapshot cutoff.
  await Promise.all(
    (Object.keys(WINDOWS) as AssetAnalyticsWindowKey[]).map(async window => {
      windows[window] = await readWindow({ ...config, now }, window)
    }),
  )
  return {
    status: 'success',
    data: {
      generatedAt: now.toISOString(),
      hosts: config.hosts,
      hostname: config.hostname,
      scope:
        config.facet === 'data'
          ? 'Hype production database and render queues · shared infrastructure'
          : `${config.hostname} · production host · independent of organisation/project prisms`,
      windows,
    },
  }
}

/**
 * Fetches and normalizes a single window with safe errors and explicit missing values.
 * @param config - Server-authorized query configuration.
 * @param window - Fixed rolling window.
 * @returns Metrics, ranked sections, and daily trend for this window.
 */
async function readWindow(
  config: Config,
  window: AssetAnalyticsWindowKey,
): Promise<PlatformAnalyticsWindow> {
  const unavailable =
    'Cloudflare could not return this section. Check token permissions and dataset retention.'
  try {
    const response = await (config.fetcher ?? fetch)(
      'https://api.cloudflare.com/client/v4/graphql',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: buildPlatformAnalyticsQuery(config, window) }),
        signal: AbortSignal.timeout(20000),
      },
    )
    if (!response.ok) throw new Error('Upstream request failed')
    const parsed = responseSchema.parse(await response.json())
    const account = parsed.data?.viewer?.accounts?.[0]
    if (!account) throw new Error('Missing account')
    const totals = account.totals
    const total = totals?.[0]
    const rankings: AnalyticsRanking[] = []
    /**
     * Projects an available dataset into a ranked section.
     * @param alias - GraphQL response alias.
     * @param title - Section label.
     * @param dimension - Grouping dimension.
     * @param metric - Optional sum field instead of the event count.
     * @returns Nothing; appends a section to this window.
     */
    const ranking = (
      alias: string,
      title: string,
      dimension: string,
      metric?: string,
    ): void => {
      const rows = account[alias]
      rankings.push({
        title,
        rows: (rows ?? []).map(row => ({
          label:
            row.dimensions?.[dimension] ||
            (alias === 'referrers' ? 'Direct / unknown' : 'Unknown'),
          value: metric ? (row.sum?.[metric] ?? 0) : (row.count ?? 0),
        })),
        ...(!rows ? { error: unavailable } : {}),
      })
    }
    if (config.facet !== 'data') {
      for (const [alias, title, dimension] of TRAFFIC_DIMENSIONS[config.facet])
        ranking(alias, title, dimension)
    } else {
      ranking('regions', 'Rows read by region', 'servedByRegion', 'rowsRead')
      const queueRows = account.queues
      for (const action of ['WriteMessage', 'ReadMessage', 'DeleteMessage']) {
        const counts = new Map<string, number>()
        for (const row of queueRows ?? []) {
          if (row.dimensions?.actionType !== action) continue
          const queueName =
            row.dimensions.queueId === 'e4fe727b98e84d44a37fa9d0f4a86005'
              ? 'Asset renders'
              : row.dimensions.queueId === 'a8e1bc6c68be4f5fa5fa12113fb58583'
                ? 'Map renders'
                : row.dimensions.queueId
          const label = `${queueName} · ${row.dimensions.outcome || 'unspecified'}`
          counts.set(label, (counts.get(label) ?? 0) + (row.count ?? 0))
        }
        rankings.push({
          title:
            action === 'WriteMessage'
              ? 'Queue writes'
              : action === 'ReadMessage'
                ? 'Queue reads'
                : 'Queue deletions',
          rows: [...counts]
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value),
          ...(!queueRows
            ? {
                error: config.queueIds?.length
                  ? unavailable
                  : 'Render queue identifiers are not configured.',
              }
            : {}),
        })
      }
    }
    /**
     * Retains unavailable metrics as null while treating empty sums as zero.
     * @param group - Aggregate family.
     * @param field - Metric name.
     * @returns Reported metric, zero for an empty sum, or null when unavailable.
     */
    const numeric = (
      group: 'sum' | 'avg' | 'quantiles',
      field: string,
    ): number | null =>
      totals?.length === 0 && group === 'sum' ? 0 : (total?.[group]?.[field] ?? null)
    return {
      metrics:
        config.facet === 'data'
          ? [
              { label: 'Read queries', value: numeric('sum', 'readQueries') },
              { label: 'Write queries', value: numeric('sum', 'writeQueries') },
              { label: 'Rows read', value: numeric('sum', 'rowsRead') },
              { label: 'Rows written', value: numeric('sum', 'rowsWritten') },
              {
                label: 'Mean batch latency',
                value: numeric('avg', 'queryBatchTimeMs'),
                unit: 'ms',
              },
              ...(['50', '95', '99'] as const).map(p => ({
                label: `p${p} batch latency`,
                value: numeric('quantiles', `queryBatchTimeMsP${p}`),
                unit: 'ms' as const,
              })),
              {
                label: 'Response bytes',
                value: numeric('sum', 'queryBatchResponseBytes'),
                unit: 'bytes',
              },
            ]
          : [
              {
                label: 'Page views',
                value: totals?.length === 0 ? 0 : (total?.count ?? null),
              },
              { label: 'Visits', value: numeric('sum', 'visits') },
            ],
      rankings,
      timeline: (account.timeline ?? []).map((row: Row) => ({
        date: row.dimensions?.date ?? '',
        value:
          config.facet === 'data'
            ? (row.sum?.readQueries ?? 0) + (row.sum?.writeQueries ?? 0)
            : (row.count ?? 0),
      })),
      ...(parsed.errors?.length || !totals ? { error: unavailable } : {}),
    }
  } catch {
    return {
      metrics: [],
      rankings: [],
      timeline: [],
      error: 'This analytics window is unavailable. Refresh to retry.',
    }
  }
}

// ---
