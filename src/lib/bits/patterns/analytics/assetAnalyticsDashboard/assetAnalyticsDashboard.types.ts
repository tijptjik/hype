// TYPES
import type {
  AssetAnalyticsSeriesKey,
  AssetAnalyticsSummaryResult,
  AssetAnalyticsWindowKey,
} from '$lib/types'

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
  timeseriesPoints: import('$lib/types').AssetAnalyticsTimeseriesPoint[]
  timelineSeriesKeys: AssetAnalyticsSeriesKey[]
  onToggleSeries: (seriesKey: AssetAnalyticsSeriesKey) => void
}

export interface AssetAnalyticsWindowMetricsCardProps {
  windowData: import('$lib/types').AssetAnalyticsSummaryWindow | null
  windowError?: string | null
  activeSeriesKeys: AssetAnalyticsSeriesKey[]
}

export interface AssetAnalyticsRankedWindowSectionCardProps {
  kind: AssetAnalyticsDashboardWindowSectionKind
  windowData: import('$lib/types').AssetAnalyticsSummaryWindow | null
  windowError?: string | null
  assetEnvironment?: string | null
}
