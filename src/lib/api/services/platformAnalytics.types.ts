import type { AssetAnalyticsWindowKey } from './assetAnalytics.types'

export type PlatformAnalyticsFacet = 'views' | 'audience' | 'data'
export type AnalyticsMetric = {
  label: string
  value: number | null
  unit?: 'ms' | 'bytes'
}
export type AnalyticsRanking = {
  title: string
  rows: { label: string; value: number }[]
  error?: string
}
export type PlatformAnalyticsWindow = {
  metrics: AnalyticsMetric[]
  rankings: AnalyticsRanking[]
  timeline: { date: string; value: number }[]
  error?: string
}
export type PlatformAnalyticsSummary = {
  generatedAt: string
  scope: string
  hosts: string[]
  hostname: string
  windows: Record<AssetAnalyticsWindowKey, PlatformAnalyticsWindow>
}
export type PlatformAnalyticsResult =
  | { status: 'success'; data: PlatformAnalyticsSummary }
  | { status: 'error'; message: string }
