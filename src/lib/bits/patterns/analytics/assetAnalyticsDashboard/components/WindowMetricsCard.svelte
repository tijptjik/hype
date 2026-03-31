<script lang="ts">
// BITS
import * as AnalyticsCardPrimitive from '$lib/bits/custom/analyticsCard/components'
import { cx } from '$lib/bits/utils'
// I18N
import { m } from '$lib/i18n'
// LOCAL
import {
  ASSET_ANALYTICS_SERIES,
  formatAnalyticsCount,
  formatAnalyticsLatency,
  formatAnalyticsPercent,
  getAssetAnalyticsSeriesLabel,
  getActiveSeriesPercents,
} from '../assetAnalyticsDashboard.utils'
// TYPES
import type {
  AssetAnalyticsBreakdownItem,
  AssetAnalyticsLatencyTier,
  AssetAnalyticsSeriesKey,
} from '$lib/types'
import type { AssetAnalyticsWindowMetricsCardProps } from '../assetAnalyticsDashboard.types'

type LatencyBar = {
  key: AssetAnalyticsSeriesKey
  label: string
  value: number | null
  color: string
}

let {
  windowData,
  windowError,
  activeSeriesKeys,
}: AssetAnalyticsWindowMetricsCardProps = $props()

const KPI_ITEMS: Array<{
  key:
    | 'totalRequests'
    | 'cacheHitPercent'
    | 'derivedHitPercent'
    | 'derivedMissPercent'
    | 'notFoundPercent'
    | 'serverErrorPercent'
  label: string
  kind: 'count' | 'percent'
  seriesKey?: AssetAnalyticsSeriesKey
  color?: string
}> = [
  { key: 'totalRequests', label: m.analytics__total_requests(), kind: 'count' },
  {
    key: 'cacheHitPercent',
    label: m.analytics__cache_percent(),
    kind: 'percent',
    seriesKey: 'cache',
    color: 'text-primary',
  },
  {
    key: 'derivedHitPercent',
    label: m.analytics__derived_hit_percent(),
    kind: 'percent',
    seriesKey: 'derivedHit',
    color: 'text-secondary',
  },
  {
    key: 'derivedMissPercent',
    label: m.analytics__derived_miss_percent(),
    kind: 'percent',
    seriesKey: 'derivedMiss',
    color: 'text-accent',
  },
  {
    key: 'notFoundPercent',
    label: '404 %',
    kind: 'percent',
    seriesKey: 'notFound',
    color: 'text-warning',
  },
  {
    key: 'serverErrorPercent',
    label: '5xx %',
    kind: 'percent',
    seriesKey: 'serverError',
    color: 'text-error',
  },
]

const LATENCY_TIERS: Array<{ key: AssetAnalyticsLatencyTier; label: string }> = [
  { key: 'p50Ms', label: 'p50' },
  { key: 'p95Ms', label: 'p95' },
  { key: 'p99Ms', label: 'p99' },
]

const BREAKDOWN_SECTIONS = [
  { key: 'cropModes', title: () => 'Crop' },
  { key: 'formats', title: () => 'Formats' },
  { key: 'dimensions', title: () => 'Dimensions' },
  { key: 'qualities', title: () => 'Quality' },
  { key: 'gravities', title: () => 'Gravity' },
] as const

const activePercentByKey = $derived(
  getActiveSeriesPercents(windowData, activeSeriesKeys),
)
const visibleKpiItems = $derived(
  KPI_ITEMS.filter(
    item => !item.seriesKey || activeSeriesKeys.includes(item.seriesKey),
  ),
)

function getKpiDisplayValue(item: (typeof KPI_ITEMS)[number]): string {
  if (!windowData) return '—'

  if (item.kind === 'count') {
    return formatAnalyticsCount(windowData.totalRequests)
  }

  const percentKey = item.key as Exclude<
    (typeof KPI_ITEMS)[number]['key'],
    'totalRequests'
  >
  return formatAnalyticsPercent(activePercentByKey[percentKey])
}

function getLatencyBars(tier: AssetAnalyticsLatencyTier): LatencyBar[] {
  const bucket = windowData?.[tier]

  return ASSET_ANALYTICS_SERIES.filter(
    series => activeSeriesKeys.includes(series.key) && series.includeInLatency,
  ).map(series => ({
    key: series.key,
    label: getAssetAnalyticsSeriesLabel(series.key),
    value: bucket?.[series.latencyKey] ?? null,
    color: series.textColorClass.replace('text-', 'bg-'),
  }))
}

function getLatencyWidth(value: number | null, maxValue: number): string {
  if (value == null || maxValue <= 0) return '0%'
  return `${Math.max((value / maxValue) * 100, 4)}%`
}

function getBreakdownItems(
  key: (typeof BREAKDOWN_SECTIONS)[number]['key'],
): AssetAnalyticsBreakdownItem[] {
  return windowData?.breakdowns[key] ?? []
}
</script>

<section class="flex min-h-0 flex-col gap-4">
  {#if !windowData}
    <AnalyticsCardPrimitive.EmptyState
      title={windowError ? 'Analytics window unavailable' : 'No analytics window available'}
      description={windowError
        ? windowError
        : 'This time range has not been emitted by the analytics engine yet.'}
    />
  {:else}
    <div class="grid grid-cols-2 gap-3">
      {#each visibleKpiItems as item}
        <article class="rounded-[1.2rem] border border-base-300 bg-[#121212] px-3 py-3">
          <p
            class="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-alt"
          >
            {item.label}
          </p>
          <p class={cx('mt-2 text-2xl font-semibold', item.color ?? 'text-foreground')}>
            {getKpiDisplayValue(item)}
          </p>
        </article>
      {/each}
    </div>

    <section
      class="space-y-4 rounded-[1.25rem] border border-base-300 bg-[#121212] p-4"
    >
      <AnalyticsCardPrimitive.SectionHeader
        title="Latency"
        tooltip="Percentile response times for the active request classes in this time window."
      />

      <div class="space-y-4">
        {#each LATENCY_TIERS as tier}
          {@const bars = getLatencyBars(tier.key)}
          {@const maxValue = Math.max(...bars.map(bar => bar.value ?? 0), 0)}

          <div class="space-y-2">
            <div
              class="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-alt"
            >
              {tier.label}
            </div>
            {#each bars as bar}
              <div class="grid grid-cols-[88px_1fr_auto] items-center gap-3">
                <div class="text-xs text-foreground-alt">{bar.label}</div>
                <div class="h-2.5 overflow-hidden rounded-full bg-white/6">
                  <div
                    class={cx('h-full rounded-full', bar.color)}
                    style={`width: ${getLatencyWidth(bar.value, maxValue)}`}
                  ></div>
                </div>
                <div class="text-xs font-medium text-foreground">
                  {formatAnalyticsLatency(bar.value)}
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </section>

    <section
      class="space-y-5 rounded-[1.25rem] border border-base-300 bg-[#121212] p-4"
    >
      <AnalyticsCardPrimitive.SectionHeader
        title="Transformations"
        tooltip="Request-weighted shares for crop mode, format, dimensions, quality, and gravity in this time window."
      />

      <div class="grid gap-x-4 gap-y-8 pb-2 xl:grid-cols-2">
        {#each BREAKDOWN_SECTIONS as breakdownSection}
          {@const items = getBreakdownItems(breakdownSection.key)}
          <article class="min-w-0">
            <div class="mb-4 flex items-center justify-between gap-3">
              <h3
                class="truncate whitespace-nowrap font-mono text-sm font-semibold text-foreground"
              >
                {breakdownSection.title()}
              </h3>
              <span
                class="shrink-0 whitespace-nowrap font-mono text-xs text-foreground-alt"
              >
                {formatAnalyticsCount(items.length)}
              </span>
            </div>

            {#if items.length === 0}
              <p class="text-sm text-foreground-alt">No requests recorded.</p>
            {:else}
              <div class="space-y-3">
                {#each items.slice(0, 6) as item}
                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between gap-3">
                      <div
                        class="min-w-0 flex-1 truncate whitespace-nowrap font-mono text-sm text-foreground"
                        title={`${item.label} • ${formatAnalyticsCount(item.requests)} requests`}
                      >
                        {item.label}
                      </div>
                      <div
                        class="shrink-0 whitespace-nowrap text-right font-mono text-xs font-medium tabular-nums text-foreground"
                      >
                        {formatAnalyticsPercent(item.percent)}
                      </div>
                    </div>

                    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <div class="h-2 overflow-hidden rounded-full bg-white/6">
                        <div
                          class="h-full rounded-full bg-primary"
                          style={`width: ${Math.max(item.percent, item.percent > 0 ? 4 : 0)}%`}
                        ></div>
                      </div>
                      <div
                        class="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-foreground-alt"
                      >
                        {formatAnalyticsCount(item.requests)}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  {/if}
</section>
