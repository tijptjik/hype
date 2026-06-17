// LIB
import { toCloudflareLocale } from '$lib/i18n'
import { toCloudflareImageWorkerPath } from '$lib/images/delivery'
// TYPES
import type {
  AssetAnalyticsPercentKey,
  AssetAnalyticsSeriesKey,
  AssetAnalyticsSummaryWindow,
  AssetAnalyticsTimeseriesPoint,
} from '$lib/types'
import type {
  AssetAnalyticsDashboardWindowSectionKind,
  AssetAnalyticsWindowConfig,
} from './assetAnalyticsDashboard.types'

const ASSET_ANALYTICS_PUBLIC_ID_PREFIX = 'h/'
const PRODUCTION_ASSET_BASE_URL = 'https://assets.hype.hk'
const PREVIEW_ASSET_BASE_URL = 'https://assets.preview.hype.hk'

export const ASSET_ANALYTICS_WINDOW_ORDER = [
  { key: '1h', label: '1h' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
] as const satisfies ReadonlyArray<AssetAnalyticsWindowConfig>

export const DEFAULT_VISIBLE_WINDOWS = [
  '1h',
  '24h',
  '30d',
] as const satisfies ReadonlyArray<AssetAnalyticsWindowConfig['key']>

export const TOP_WINDOW_SECTION_ORDER = [
  'transformations',
  'images',
] as const satisfies ReadonlyArray<AssetAnalyticsDashboardWindowSectionKind>

export const FAILURE_WINDOW_SECTION_ORDER = [
  'missingImages',
  'serverErrorImages',
] as const satisfies ReadonlyArray<AssetAnalyticsDashboardWindowSectionKind>

export type AnalyticsTransformationBadgeCategory =
  | 'cropMode'
  | 'gravity'
  | 'quality'
  | 'format'
  | 'dimensions'
  | 'other'

export type AnalyticsTransformationBadge = {
  category: AnalyticsTransformationBadgeCategory
  label: string
}

export type AssetAnalyticsSeriesConfig = {
  key: AssetAnalyticsSeriesKey
  label: string
  percentKey: AssetAnalyticsPercentKey
  timeseriesKey: keyof Pick<
    AssetAnalyticsTimeseriesPoint,
    | 'cacheRequests'
    | 'derivedHitRequests'
    | 'derivedMissRequests'
    | 'notFoundRequests'
    | 'serverErrorRequests'
  >
  latencyKey: keyof Pick<
    AssetAnalyticsSummaryWindow['p50Ms'],
    'cache' | 'derivedHit' | 'derivedMiss' | 'notFound' | 'serverError'
  >
  colorVar: string
  textColorClass: string
  includeInLatency: boolean
}

export const ASSET_ANALYTICS_SERIES: AssetAnalyticsSeriesConfig[] = [
  {
    key: 'cache',
    label: 'cache',
    percentKey: 'cacheHitPercent',
    timeseriesKey: 'cacheRequests',
    latencyKey: 'cache',
    colorVar: 'var(--color-primary)',
    textColorClass: 'text-primary',
    includeInLatency: true,
  },
  {
    key: 'derivedHit',
    label: 'derivedHit',
    percentKey: 'derivedHitPercent',
    timeseriesKey: 'derivedHitRequests',
    latencyKey: 'derivedHit',
    colorVar: 'var(--color-secondary)',
    textColorClass: 'text-secondary',
    includeInLatency: true,
  },
  {
    key: 'derivedMiss',
    label: 'derivedMiss',
    percentKey: 'derivedMissPercent',
    timeseriesKey: 'derivedMissRequests',
    latencyKey: 'derivedMiss',
    colorVar: 'var(--color-accent)',
    textColorClass: 'text-accent',
    includeInLatency: true,
  },
  {
    key: 'notFound',
    label: 'notFound',
    percentKey: 'notFoundPercent',
    timeseriesKey: 'notFoundRequests',
    latencyKey: 'notFound',
    colorVar: 'var(--color-warning)',
    textColorClass: 'text-warning',
    includeInLatency: false,
  },
  {
    key: 'serverError',
    label: 'serverError',
    percentKey: 'serverErrorPercent',
    timeseriesKey: 'serverErrorRequests',
    latencyKey: 'serverError',
    colorVar: 'var(--color-error)',
    textColorClass: 'text-error',
    includeInLatency: false,
  },
]

export function getAssetAnalyticsSeriesLabel(
  seriesKey: AssetAnalyticsSeriesKey,
): string {
  if (seriesKey === 'cache') return 'Cache'
  if (seriesKey === 'derivedHit') return 'Derived hit'
  if (seriesKey === 'derivedMiss') return 'Derived miss'
  if (seriesKey === 'notFound') return '404 not found'
  return '5xx error'
}

/**
 * Removes the analytics namespace prefix from a ranked image id.
 *
 * @param publicId Ranked image key emitted by the analytics dataset.
 * @returns Public id compatible with asset delivery URLs.
 */
export function normalizeAssetAnalyticsPublicId(publicId: string): string {
  return publicId.startsWith(ASSET_ANALYTICS_PUBLIC_ID_PREFIX)
    ? publicId.slice(ASSET_ANALYTICS_PUBLIC_ID_PREFIX.length)
    : publicId
}

/**
 * Builds a fixed preview URL for ranked analytics images.
 *
 * @param params.publicId Analytics-ranked public id.
 * @param params.environment Analytics environment label.
 * @returns Absolute CDN URL for a lightweight preview transform.
 */
export function buildAssetAnalyticsPreviewUrl(params: {
  publicId: string
  environment?: string | null
}): string {
  const baseUrl =
    params.environment === 'preview'
      ? PREVIEW_ASSET_BASE_URL
      : PRODUCTION_ASSET_BASE_URL

  return `${baseUrl}${toCloudflareImageWorkerPath({
    publicId: params.publicId,
    transformation: 'c_fill,h_256,w_256',
    gravity: 'auto',
    quality: 'auto',
    format: 'webp',
  })}`
}

/**
 * Formats numeric counts used across analytics cards.
 *
 * @param value Count value.
 * @returns Localized count or fallback dash.
 */
export function formatAnalyticsCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return Intl.NumberFormat(toCloudflareLocale()).format(value)
}

/**
 * Formats percentage values for analytics displays.
 *
 * @param value Percentage value.
 * @returns Fixed 1-decimal percentage or fallback dash.
 */
export function formatAnalyticsPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)}%`
}

/**
 * Formats latency values in milliseconds.
 *
 * @param value Latency value in ms.
 * @returns Rounded latency display or fallback dash.
 */
export function formatAnalyticsLatency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${Math.round(value)} ms`
}

/**
 * Formats daily timeline labels in UTC.
 *
 * @param value ISO-like date string.
 * @returns Compact month-day label or original value if invalid.
 */
export function formatAnalyticsDayLabel(value: string): string {
  if (!value) return '—'

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(toCloudflareLocale(), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

const toCapitalizedToken = (value: string): string =>
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value

const formatTransformationToken = (
  token: string,
): AnalyticsTransformationBadge | null => {
  if (token.startsWith('c_')) {
    return { category: 'cropMode', label: toCapitalizedToken(token.slice(2)) }
  }

  if (token.startsWith('fit=')) {
    return {
      category: 'cropMode',
      label: toCapitalizedToken(token.slice('fit='.length)),
    }
  }

  if (token.startsWith('g_')) {
    return { category: 'gravity', label: `G:${toCapitalizedToken(token.slice(2))}` }
  }

  if (token.startsWith('gravity=')) {
    return {
      category: 'gravity',
      label: `G:${toCapitalizedToken(token.slice('gravity='.length))}`,
    }
  }

  if (token.startsWith('q_')) {
    return { category: 'quality', label: `Q:${toCapitalizedToken(token.slice(2))}` }
  }

  if (token.startsWith('quality=')) {
    return {
      category: 'quality',
      label: `Q:${toCapitalizedToken(token.slice('quality='.length))}`,
    }
  }

  if (token.startsWith('f_')) {
    return { category: 'format', label: token.slice(2).toUpperCase() }
  }

  if (token.startsWith('format=')) {
    return {
      category: 'format',
      label: token.slice('format='.length).toUpperCase(),
    }
  }

  return { category: 'other', label: token }
}

/**
 * Converts a raw transform key into concise UI badges.
 *
 * @param transformKey Canonical transform key stored in analytics.
 * @returns Ordered badge labels for compact table display.
 */
export function toAnalyticsTransformationBadges(
  transformKey: string,
): AnalyticsTransformationBadge[] {
  const tokens = transformKey
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)

  const badges: AnalyticsTransformationBadge[] = []
  let width: string | null = null
  let height: string | null = null
  let sizeIndex: number | null = null

  for (const token of tokens) {
    if (token.startsWith('w_') || token.startsWith('w=')) {
      width = token.slice(2)
      sizeIndex ??= badges.length
      continue
    }

    if (token.startsWith('width=')) {
      width = token.slice('width='.length)
      sizeIndex ??= badges.length
      continue
    }

    if (token.startsWith('h_') || token.startsWith('h=')) {
      height = token.slice(2)
      sizeIndex ??= badges.length
      continue
    }

    if (token.startsWith('height=')) {
      height = token.slice('height='.length)
      sizeIndex ??= badges.length
      continue
    }

    const formattedToken = formatTransformationToken(token)
    if (formattedToken) {
      badges.push(formattedToken)
    }
  }

  if (width || height) {
    const sizeBadge = {
      category: 'dimensions' as const,
      label:
        width && height ? `${width}x${height}` : width ? `W:${width}` : `H:${height}`,
    }

    if (sizeIndex == null || sizeIndex >= badges.length) {
      badges.push(sizeBadge)
    } else {
      badges.splice(sizeIndex, 0, sizeBadge)
    }
  }

  return badges
}

/**
 * Recalculates per-series percentages against the active subset.
 *
 * @param windowData Window analytics payload.
 * @param activeSeriesKeys Active visible series keys.
 * @returns Normalized percent lookup for the current toggle state.
 */
export function getActiveSeriesPercents(
  windowData: AssetAnalyticsSummaryWindow | null | undefined,
  activeSeriesKeys: AssetAnalyticsSeriesKey[],
): Record<AssetAnalyticsPercentKey, number> {
  const percentEntries = ASSET_ANALYTICS_SERIES.map(series => ({
    key: series.key,
    percentKey: series.percentKey,
    value: windowData?.[series.percentKey] ?? 0,
  }))

  const activeTotal = percentEntries.reduce((sum, entry) => {
    return activeSeriesKeys.includes(entry.key) ? sum + entry.value : sum
  }, 0)

  return Object.fromEntries(
    percentEntries.map(entry => [
      entry.percentKey,
      activeTotal > 0 && activeSeriesKeys.includes(entry.key)
        ? (entry.value / activeTotal) * 100
        : 0,
    ]),
  ) as Record<AssetAnalyticsPercentKey, number>
}
