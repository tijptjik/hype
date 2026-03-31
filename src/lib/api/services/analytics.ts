import { z } from 'zod'
// TYPES
import type {
  AssetAnalyticsBreakdownItem,
  AssetAnalyticsBreakdowns,
  AssetAnalyticsLatencyBucket,
  AssetAnalyticsSummary,
  AssetAnalyticsSummaryResult,
  AssetAnalyticsSummaryWindow,
  AssetAnalyticsTimeseriesPoint,
  AssetAnalyticsWindowKey,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// FETCH
// - fetchAssetAnalyticsSummary
//
// CONFIG
// - resolveAssetAnalyticsConfig
//
// NORMALIZATION
// - toAssetAnalyticsSummary
// - toWindowSummary

const ANALYTICS_WINDOWS = ['1h', '24h', '7d', '30d'] as const satisfies readonly [
  AssetAnalyticsWindowKey,
  AssetAnalyticsWindowKey,
  AssetAnalyticsWindowKey,
  AssetAnalyticsWindowKey,
]

const PRODUCTION_ASSET_ANALYTICS_BASE_URL = 'https://assets.hype.hk'

const latencyBucketSchema = z
  .object({
    cache: z.number().finite().nonnegative().nullable().optional(),
    derivedHit: z.number().finite().nonnegative().nullable().optional(),
    derivedMiss: z.number().finite().nonnegative().nullable().optional(),
    notFound: z.number().finite().nonnegative().nullable().optional(),
    serverError: z.number().finite().nonnegative().nullable().optional(),
  })
  .partial()

const windowSummarySchema = z.object({
  totalRequests: z.number().int().nonnegative().default(0),
  cacheHitPercent: z.number().finite().nonnegative().default(0),
  derivedHitPercent: z.number().finite().nonnegative().default(0),
  derivedMissPercent: z.number().finite().nonnegative().default(0),
  notFoundPercent: z.number().finite().nonnegative().default(0),
  serverErrorPercent: z.number().finite().nonnegative().default(0),
  p50Ms: latencyBucketSchema.optional(),
  p95Ms: latencyBucketSchema.optional(),
  p99Ms: latencyBucketSchema.optional(),
  timeseries30d: z
    .array(
      z.object({
        date: z.string().min(1),
        totalRequests: z.number().int().nonnegative().default(0),
        cacheRequests: z.number().int().nonnegative().default(0),
        derivedHitRequests: z.number().int().nonnegative().default(0),
        derivedMissRequests: z.number().int().nonnegative().default(0),
        notFoundRequests: z.number().int().nonnegative().default(0),
        serverErrorRequests: z.number().int().nonnegative().default(0),
      }),
    )
    .default([]),
  breakdowns: z
    .object({
      cropModes: z.array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          requests: z.number().int().nonnegative(),
          percent: z.number().finite().nonnegative(),
        }),
      ),
      formats: z.array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          requests: z.number().int().nonnegative(),
          percent: z.number().finite().nonnegative(),
        }),
      ),
      dimensions: z.array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          requests: z.number().int().nonnegative(),
          percent: z.number().finite().nonnegative(),
        }),
      ),
      qualities: z.array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          requests: z.number().int().nonnegative(),
          percent: z.number().finite().nonnegative(),
        }),
      ),
      gravities: z.array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          requests: z.number().int().nonnegative(),
          percent: z.number().finite().nonnegative(),
        }),
      ),
    })
    .default({
      cropModes: [],
      formats: [],
      dimensions: [],
      qualities: [],
      gravities: [],
    }),
  topTransformations: z
    .array(
      z.object({
        transformKey: z.string().min(1),
        requests: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  topImages: z
    .array(
      z.object({
        publicId: z.string().min(1),
        requests: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  topMissingImages: z
    .array(
      z.object({
        publicId: z.string().min(1),
        requests: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  topServerErrorImages: z
    .array(
      z.object({
        publicId: z.string().min(1),
        requests: z.number().int().nonnegative(),
      }),
    )
    .default([]),
})

const assetAnalyticsSummarySchema = z.object({
  environment: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  scope: z
    .object({
      organisationIds: z.array(z.string()).default([]),
      projectIds: z.array(z.string()).default([]),
    })
    .default({ organisationIds: [], projectIds: [] }),
  windows: z
    .object({
      '1h': windowSummarySchema.optional(),
      '24h': windowSummarySchema.optional(),
      '7d': windowSummarySchema.optional(),
      '30d': windowSummarySchema.optional(),
    })
    .default({}),
  windowErrors: z
    .object({
      '1h': z.string().min(1).optional(),
      '24h': z.string().min(1).optional(),
      '7d': z.string().min(1).optional(),
      '30d': z.string().min(1).optional(),
    })
    .default({}),
})

const toLatencyBucket = (
  value?: Partial<AssetAnalyticsLatencyBucket>,
): AssetAnalyticsLatencyBucket => ({
  cache: value?.cache ?? null,
  derivedHit: value?.derivedHit ?? null,
  derivedMiss: value?.derivedMiss ?? null,
  notFound: value?.notFound ?? null,
  serverError: value?.serverError ?? null,
})

const toBreakdownItem = (
  value: Partial<AssetAnalyticsBreakdownItem>,
): AssetAnalyticsBreakdownItem => ({
  key: value.key ?? '',
  label: value.label ?? value.key ?? '',
  requests: value.requests ?? 0,
  percent: value.percent ?? 0,
})

const toBreakdowns = (
  value?: Partial<AssetAnalyticsBreakdowns>,
): AssetAnalyticsBreakdowns => ({
  cropModes: (value?.cropModes ?? []).map(toBreakdownItem),
  formats: (value?.formats ?? []).map(toBreakdownItem),
  dimensions: (value?.dimensions ?? []).map(toBreakdownItem),
  qualities: (value?.qualities ?? []).map(toBreakdownItem),
  gravities: (value?.gravities ?? []).map(toBreakdownItem),
})

const toTimeseriesPoint = (
  value: Partial<AssetAnalyticsTimeseriesPoint>,
): AssetAnalyticsTimeseriesPoint => ({
  date: value.date ?? '',
  totalRequests: value.totalRequests ?? 0,
  cacheRequests: value.cacheRequests ?? 0,
  derivedHitRequests: value.derivedHitRequests ?? 0,
  derivedMissRequests: value.derivedMissRequests ?? 0,
  notFoundRequests: value.notFoundRequests ?? 0,
  serverErrorRequests: value.serverErrorRequests ?? 0,
})

/**
 * Normalizes a single analytics window into a stable UI contract.
 *
 * @param value - Parsed window payload or `undefined` when the analytics engine has not emitted it yet.
 * @returns A normalized window or `null` when the entire window is unavailable.
 */
export function toWindowSummary(
  value?: z.infer<typeof windowSummarySchema>,
): AssetAnalyticsSummaryWindow | null {
  if (!value) return null

  return {
    totalRequests: value.totalRequests,
    cacheHitPercent: value.cacheHitPercent,
    derivedHitPercent: value.derivedHitPercent,
    derivedMissPercent: value.derivedMissPercent,
    notFoundPercent: value.notFoundPercent,
    serverErrorPercent: value.serverErrorPercent,
    p50Ms: toLatencyBucket(value.p50Ms),
    p95Ms: toLatencyBucket(value.p95Ms),
    p99Ms: toLatencyBucket(value.p99Ms),
    timeseries30d: value.timeseries30d.map(toTimeseriesPoint),
    breakdowns: toBreakdowns(value.breakdowns),
    topTransformations: value.topTransformations,
    topImages: value.topImages,
    topMissingImages: value.topMissingImages,
    topServerErrorImages: value.topServerErrorImages,
  }
}

/**
 * Normalizes the raw analytics payload into a stable set of fixed windows.
 *
 * @param payload - Untrusted JSON from the asset worker analytics endpoint.
 * @returns A normalized asset analytics summary suitable for admin rendering.
 */
export function toAssetAnalyticsSummary(payload: unknown): AssetAnalyticsSummary {
  const parsed = assetAnalyticsSummarySchema.parse(payload)

  return {
    environment: parsed.environment,
    generatedAt: parsed.generatedAt,
    scope: parsed.scope,
    windows: {
      '1h': toWindowSummary(parsed.windows['1h']),
      '24h': toWindowSummary(parsed.windows['24h']),
      '7d': toWindowSummary(parsed.windows['7d']),
      '30d': toWindowSummary(parsed.windows['30d']),
    },
    windowErrors: parsed.windowErrors,
  }
}

const hasAnyWindowData = (summary: AssetAnalyticsSummary): boolean =>
  ANALYTICS_WINDOWS.some(windowKey => {
    const window = summary.windows[windowKey]
    if (!window) return false

    return (
      window.totalRequests > 0 ||
      window.topTransformations.length > 0 ||
      window.topImages.length > 0 ||
      window.topMissingImages.length > 0 ||
      window.topServerErrorImages.length > 0
    )
  })

const hasAnyWindowErrors = (summary: AssetAnalyticsSummary): boolean =>
  ANALYTICS_WINDOWS.some(windowKey => {
    const message = summary.windowErrors[windowKey]
    return typeof message === 'string' && message.trim().length > 0
  })

const formatWindowErrorSummary = (summary: AssetAnalyticsSummary): string =>
  ANALYTICS_WINDOWS.flatMap(windowKey => {
    const message = summary.windowErrors[windowKey]?.trim()
    return message ? [`${windowKey}: ${message}`] : []
  }).join(' | ')

/**
 * Resolves the analytics endpoint and token for the current runtime.
 *
 * @param params.environment - Current app environment name.
 * @param params.baseUrl - Configured analytics base URL for the active environment.
 * @param params.readToken - Read token from platform bindings.
 * @param params.privateReadToken - Read token from server private envs.
 * @param params.legacyPrivateReadToken - Legacy token fallback from server private envs.
 * @returns Normalized configuration used to query the analytics endpoint.
 * @remarks
 * Local and preview runtimes intentionally read from production analytics because
 * those environments do not carry meaningful asset traffic.
 */
export function resolveAssetAnalyticsConfig(params: {
  environment?: string | null
  baseUrl?: string | null
  readToken?: string | null
  privateReadToken?: string | null
  legacyPrivateReadToken?: string | null
}): {
  baseUrl: string
  readToken: string
} {
  const environment = params.environment?.trim().toLowerCase()
  const configuredBaseUrl = params.baseUrl?.trim()

  const baseUrl =
    environment === 'local' || environment === 'preview'
      ? PRODUCTION_ASSET_ANALYTICS_BASE_URL
      : configuredBaseUrl || PRODUCTION_ASSET_ANALYTICS_BASE_URL

  const readToken =
    params.readToken?.trim() ||
    params.privateReadToken?.trim() ||
    params.legacyPrivateReadToken?.trim() ||
    ''

  return {
    baseUrl,
    readToken,
  }
}

/**
 * Fetches the asset analytics summary using the server-only read token.
 *
 * @param params.baseUrl - Public asset base URL.
 * @param params.readToken - Server-only analytics read token.
 * @param params.fetcher - Optional fetch implementation for tests.
 * @returns A success, empty, or error state for admin consumption.
 */
export async function fetchAssetAnalyticsSummary(params: {
  baseUrl?: string | null
  readToken?: string | null
  scopePrefixes?: string[]
  organisationIds?: string[]
  projectIds?: string[]
  fetcher?: typeof fetch
}): Promise<AssetAnalyticsSummaryResult> {
  const baseUrl = params.baseUrl?.trim()
  const readToken = params.readToken?.trim()

  if (!baseUrl || !readToken) {
    return {
      status: 'error',
      message:
        'Asset analytics is unavailable because PUBLIC_ASSET_BASE_URL or ASSET_ANALYTICS_READ_TOKEN is not configured.',
    }
  }

  const fetcher = params.fetcher ?? fetch
  const url = new URL('/analytics/summary', `${baseUrl.replace(/\/+$/, '')}/`)
  for (const scopePrefix of params.scopePrefixes ?? []) {
    if (scopePrefix.trim()) {
      url.searchParams.append('scopePrefix', scopePrefix.trim())
    }
  }
  for (const organisationId of params.organisationIds ?? []) {
    if (organisationId.trim()) {
      url.searchParams.append('organisationId', organisationId.trim())
    }
  }
  for (const projectId of params.projectIds ?? []) {
    if (projectId.trim()) {
      url.searchParams.append('projectId', projectId.trim())
    }
  }

  try {
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${readToken}`,
      },
    })

    if (!response.ok) {
      let responseDetail = ''

      try {
        const payload = (await response.json()) as { error?: unknown }
        if (typeof payload.error === 'string' && payload.error.trim()) {
          responseDetail = payload.error.trim()
        }
      } catch {
        try {
          const text = (await response.text()).trim()
          if (text) {
            responseDetail = text
          }
        } catch {
          responseDetail = ''
        }
      }

      return {
        status: 'error',
        message: responseDetail
          ? `Asset analytics request failed with ${response.status} ${response.statusText}: ${responseDetail}`
          : `Asset analytics request failed with ${response.status} ${response.statusText}.`,
      }
    }

    const summary = toAssetAnalyticsSummary(await response.json())

    if (!hasAnyWindowData(summary) && hasAnyWindowErrors(summary)) {
      return {
        status: 'error',
        message: `Asset analytics windows failed: ${formatWindowErrorSummary(summary)}`,
      }
    }

    if (!hasAnyWindowData(summary)) {
      return {
        status: 'empty',
        message: 'No asset analytics data is available for the configured windows yet.',
        data: summary,
      }
    }

    return {
      status: 'success',
      data: summary,
    }
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Asset analytics request failed unexpectedly.',
    }
  }
}
