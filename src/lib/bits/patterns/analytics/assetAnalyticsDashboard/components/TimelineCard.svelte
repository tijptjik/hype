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
  formatAnalyticsDayLabel,
  getAssetAnalyticsSeriesLabel,
} from '../assetAnalyticsDashboard.utils'
// TYPES
import type { AssetAnalyticsSeriesKey, AssetAnalyticsTimeseriesPoint } from '$lib/types'
import type { AssetAnalyticsTimelineCardProps } from '../assetAnalyticsDashboard.types'

type TimelineSegment = {
  key: AssetAnalyticsSeriesKey
  fill: string
  height: number
  y: number
}

type TimelineTooltipState = {
  left: number
  top: number
  date: string
  label: string
  value: string
  total: string
} | null

let {
  timeseriesPoints,
  timelineSeriesKeys,
  onToggleSeries,
}: AssetAnalyticsTimelineCardProps = $props()

const timelineChartHeight = 216
const timelineChartWidth = $derived(Math.max(timeseriesPoints.length * 28, 840))
const timelinePlotWidth = $derived(
  Math.min(
    timelineChartWidth,
    Math.max(timeseriesPoints.length * 28, timeseriesPoints.length * 80),
  ),
)
const timelinePlotOffsetX = $derived((timelineChartWidth - timelinePlotWidth) / 2)
const timelineStepWidth = $derived(
  timelinePlotWidth / Math.max(timeseriesPoints.length, 1),
)
const timelineBarWidth = $derived(Math.min(Math.max(timelineStepWidth * 0.64, 10), 50))

let timelineTooltip = $state<TimelineTooltipState>(null)
let timelineChartContainer = $state<HTMLDivElement | null>(null)

const activeTimelineSeries = $derived(
  ASSET_ANALYTICS_SERIES.filter(series => timelineSeriesKeys.includes(series.key)),
)
const timeseriesMax = $derived(
  Math.max(
    ...timeseriesPoints.map(point =>
      activeTimelineSeries.reduce(
        (sum, series) => sum + point[series.timeseriesKey],
        0,
      ),
    ),
    0,
  ),
)

function getChartValueHeight(
  value: number,
  maxValue: number,
  chartHeight: number,
): number {
  if (maxValue <= 0 || value <= 0) return 0
  return Math.max((value / maxValue) * chartHeight, 4)
}

function getTimelineSegmentLabel(segment: AssetAnalyticsSeriesKey): string {
  return getAssetAnalyticsSeriesLabel(segment)
}

function getTimelineSegmentValue(
  point: AssetAnalyticsTimeseriesPoint,
  segment: AssetAnalyticsSeriesKey,
): number {
  const timeseriesKey = ASSET_ANALYTICS_SERIES.find(
    series => series.key === segment,
  )?.timeseriesKey
  return timeseriesKey ? point[timeseriesKey] : 0
}

function getActiveTimelineTotal(point: AssetAnalyticsTimeseriesPoint): number {
  return activeTimelineSeries.reduce(
    (sum, series) => sum + point[series.timeseriesKey],
    0,
  )
}

function getTimelineSegments(point: AssetAnalyticsTimeseriesPoint): TimelineSegment[] {
  const segments: TimelineSegment[] = []

  for (const series of activeTimelineSeries) {
    const height = getChartValueHeight(
      point[series.timeseriesKey],
      timeseriesMax,
      timelineChartHeight,
    )
    const previousY = segments.at(-1)?.y ?? timelineChartHeight

    segments.push({
      key: series.key,
      fill: series.colorVar,
      height,
      y: previousY - height,
    })
  }

  return segments
}

function showTimelineTooltip(
  event: MouseEvent,
  point: AssetAnalyticsTimeseriesPoint,
  segment: AssetAnalyticsSeriesKey,
): void {
  if (!timelineChartContainer) return

  const bounds = timelineChartContainer.getBoundingClientRect()
  const left = Math.min(Math.max(event.clientX - bounds.left, 72), bounds.width - 72)
  const top = Math.max(event.clientY - bounds.top - 14, 12)

  timelineTooltip = {
    left,
    top,
    date: formatAnalyticsDayLabel(point.date),
    label: getTimelineSegmentLabel(segment),
    value: formatAnalyticsCount(getTimelineSegmentValue(point, segment)),
    total: formatAnalyticsCount(getActiveTimelineTotal(point)),
  }
}

function hideTimelineTooltip(): void {
  timelineTooltip = null
}

function getTimelineAxisLabel(date: string): string {
  return formatAnalyticsDayLabel(date).toUpperCase()
}

function shouldRenderTimelineAxisLabel(index: number, total: number): boolean {
  if (total <= 7) return true

  const step = Math.max(Math.round(total / 7), 1)
  return index % step === 0 || index === total - 1
}
</script>

<AnalyticsCardPrimitive.Root>
  <AnalyticsCardPrimitive.Header
    title={m.analytics__timeline_title()}
    leftLabel={m.analytics__timeline_left_label()}
    rightLabel={m.analytics__timeline_right_label()}
    tooltip="Daily request mix for the last 30 days across the active prism scope."
  />

  {#if timeseriesPoints.length === 0}
    <AnalyticsCardPrimitive.EmptyState
      class="mt-5"
      title="No 30-day time series yet"
      description="This view fills once Cloudflare has emitted daily asset-delivery data."
    />
  {:else}
    <div class="mt-5">
      <div
        class="mb-4 flex flex-wrap items-center justify-center gap-2 text-xs uppercase tracking-[0.18em]"
      >
        {#each ASSET_ANALYTICS_SERIES as series}
          {@const isActive = timelineSeriesKeys.includes(series.key)}
          <button
            type="button"
            aria-pressed={isActive}
            onclick={() => onToggleSeries(series.key)}
            class={cx(
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition',
              isActive
                ? 'text-foreground'
                : 'bg-transparent text-foreground-alt hover:text-foreground',
            )}
          >
            <span
              class={cx(
                'h-2.5 w-2.5 rounded-full',
                series.textColorClass.replace('text-', 'bg-'),
              )}
            ></span>
            {getAssetAnalyticsSeriesLabel(series.key)}
          </button>
        {/each}
      </div>

      <div class="rounded-[1.4rem] border border-white/10 bg-[#151515] p-4 pt-8">
        <div
          class="relative h-64 overflow-x-auto rounded-[1rem] "
          bind:this={timelineChartContainer}
        >
          <svg
            class="block h-64"
            style={`width: ${timelineChartWidth}px; min-width: 100%;`}
            viewBox={`0 0 ${timelineChartWidth} ${timelineChartHeight + 28}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="30 day asset delivery time series"
          >
            {#each [0.25, 0.5, 0.75, 1] as marker}
              <line
                x1={timelinePlotOffsetX}
                y1={timelineChartHeight - timelineChartHeight * marker}
                x2={timelineChartWidth - timelinePlotOffsetX}
                y2={timelineChartHeight - timelineChartHeight * marker}
                stroke="var(--color-base-content)"
                stroke-opacity={marker === 1 ? '0.28' : '0.14'}
                stroke-width="1"
              />
            {/each}

            {#each timeseriesPoints as point, index}
              {@const x = timelinePlotOffsetX + index * timelineStepWidth + (timelineStepWidth - timelineBarWidth) / 2}
              {@const timelineSegments = getTimelineSegments(point)}
              <g>
                {#each [...timelineSegments].reverse() as segment}
                  {#if segment.height > 0}
                    <rect
                      {x}
                      y={segment.y}
                      width={timelineBarWidth}
                      height={segment.height}
                      fill={segment.fill}
                      onmouseenter={event => showTimelineTooltip(event, point, segment.key)}
                      onmousemove={event => showTimelineTooltip(event, point, segment.key)}
                      onmouseleave={hideTimelineTooltip}
                    />
                  {/if}
                {/each}
                <text
                  x={x + timelineBarWidth / 2}
                  y={timelineChartHeight + 18}
                  text-anchor="middle"
                  font-size="10"
                  font-weight="600"
                  letter-spacing="0.16em"
                  fill="var(--color-base-content)"
                  fill-opacity={shouldRenderTimelineAxisLabel(index, timeseriesPoints.length)
                    ? '0.68'
                    : '0'}
                >
                  {shouldRenderTimelineAxisLabel(index, timeseriesPoints.length)
                    ? getTimelineAxisLabel(point.date)
                    : ''}
                </text>
              </g>
            {/each}
          </svg>

          {#if timelineTooltip}
            <div
              class="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-[1rem] border border-base-300 bg-black px-3 py-2 shadow-xl"
              style={`left: ${timelineTooltip.left}px; top: ${timelineTooltip.top}px;`}
            >
              <p
                class="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground-alt"
              >
                {timelineTooltip.date}
              </p>
              <p class="mt-1 text-sm font-semibold text-foreground">
                {timelineTooltip.label}: {timelineTooltip.value}
              </p>
              <p class="mt-1 text-xs text-foreground-alt">
                Active total: {timelineTooltip.total}
              </p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</AnalyticsCardPrimitive.Root>
