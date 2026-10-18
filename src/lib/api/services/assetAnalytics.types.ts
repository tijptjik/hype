// TYPES

/* ----------------- */
// ASSET ANALYTICS
/* -------- */

export type AssetAnalyticsWindowKey = '1h' | '24h' | '7d' | '30d'

export type AssetAnalyticsSeriesKey =
  | 'cache'
  | 'derivedHit'
  | 'derivedMiss'
  | 'notFound'
  | 'serverError'

export type AssetAnalyticsLatencyBucket = {
  cache: number | null
  derivedHit: number | null
  derivedMiss: number | null
  notFound: number | null
  serverError: number | null
}

export type AssetAnalyticsRankedTransformation = {
  transformKey: string
  requests: number
}

export type AssetAnalyticsTimeseriesPoint = {
  date: string
  totalRequests: number
  cacheRequests: number
  derivedHitRequests: number
  derivedMissRequests: number
  notFoundRequests: number
  serverErrorRequests: number
}

export type AssetAnalyticsBreakdownItem = {
  key: string
  label: string
  requests: number
  percent: number
}

export type AssetAnalyticsBreakdowns = {
  cropModes: AssetAnalyticsBreakdownItem[]
  formats: AssetAnalyticsBreakdownItem[]
  dimensions: AssetAnalyticsBreakdownItem[]
  qualities: AssetAnalyticsBreakdownItem[]
  gravities: AssetAnalyticsBreakdownItem[]
}

export type AssetAnalyticsRankedImage = {
  publicId: string
  requests: number
}

export type AssetAnalyticsSummaryWindow = {
  totalRequests: number
  cacheHitPercent: number
  derivedHitPercent: number
  derivedMissPercent: number
  notFoundPercent: number
  serverErrorPercent: number
  p50Ms: AssetAnalyticsLatencyBucket
  p95Ms: AssetAnalyticsLatencyBucket
  p99Ms: AssetAnalyticsLatencyBucket
  timeseries30d: AssetAnalyticsTimeseriesPoint[]
  breakdowns: AssetAnalyticsBreakdowns
  topTransformations: AssetAnalyticsRankedTransformation[]
  topImages: AssetAnalyticsRankedImage[]
  topMissingImages: AssetAnalyticsRankedImage[]
  topServerErrorImages: AssetAnalyticsRankedImage[]
}

type AssetAnalyticsWindowErrors = Partial<Record<AssetAnalyticsWindowKey, string>>

export type AssetAnalyticsSummary = {
  environment: string
  generatedAt: string
  scope: {
    organisationIds: string[]
    projectIds: string[]
  }
  windows: Record<AssetAnalyticsWindowKey, AssetAnalyticsSummaryWindow | null>
  windowErrors: AssetAnalyticsWindowErrors
}

export type AssetAnalyticsSummaryResult =
  | {
      status: 'success'
      data: AssetAnalyticsSummary
    }
  | {
      status: 'empty'
      message: string
      data: AssetAnalyticsSummary | null
    }
  | {
      status: 'error'
      message: string
    }

export type AssetAnalyticsScope = {
  scopePrefixes: string[]
  organisationIds: string[]
  projectIds: string[]
}
