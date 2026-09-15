// TYPES
import type {
  AssetAnalyticsSeriesKey,
  AssetAnalyticsSummaryResult,
  AssetAnalyticsWindowKey,
} from '$lib/api/services/assetAnalytics.types'

export type AssetAnalyticsDashboardWindowSectionKind =
  | 'transformations'
  | 'images'
  | 'missingImages'
  | 'serverErrorImages'

export type AssetAnalyticsWindowConfig = {
  key: AssetAnalyticsWindowKey
  label: string
}

export interface AssetAnalyticsDashboardProps {
  state: AssetAnalyticsSummaryResult
}

export interface AssetAnalyticsTimelineCardProps {
  timeseriesPoints: import('$lib/api/services/assetAnalytics.types').AssetAnalyticsTimeseriesPoint[]
  timelineSeriesKeys: AssetAnalyticsSeriesKey[]
  onToggleSeries: (seriesKey: AssetAnalyticsSeriesKey) => void
}

export interface AssetAnalyticsWindowMetricsCardProps {
  windowData: import('$lib/api/services/assetAnalytics.types').AssetAnalyticsSummaryWindow | null
  windowError?: string | null
  activeSeriesKeys: AssetAnalyticsSeriesKey[]
}

export interface AssetAnalyticsRankedWindowSectionCardProps {
  kind: AssetAnalyticsDashboardWindowSectionKind
  windowData: import('$lib/api/services/assetAnalytics.types').AssetAnalyticsSummaryWindow | null
  windowError?: string | null
  assetEnvironment?: string | null
}
