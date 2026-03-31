<script lang="ts">
// BITS
import * as AnalyticsCardPrimitive from '$lib/bits/custom/analyticsCard/components'
import { cx } from '$lib/bits/utils'
// I18N
import { m } from '$lib/i18n'
// LOCAL
import * as AssetAnalyticsDashboardPrimitive from './components'
import {
  ASSET_ANALYTICS_SERIES,
  ASSET_ANALYTICS_WINDOW_ORDER,
  DEFAULT_VISIBLE_WINDOWS,
  FAILURE_WINDOW_SECTION_ORDER,
  TOP_WINDOW_SECTION_ORDER,
} from './assetAnalyticsDashboard.utils'
// TYPES
import type { AssetAnalyticsSeriesKey, AssetAnalyticsWindowKey } from '$lib/types'
import type { AssetAnalyticsDashboardProps } from './assetAnalyticsDashboard.types'

let { state: analyticsState }: AssetAnalyticsDashboardProps = $props()

let visibleWindowKeys = $state<Array<AssetAnalyticsWindowKey>>([
  ...DEFAULT_VISIBLE_WINDOWS,
])
let timelineSeriesKeys = $state<AssetAnalyticsSeriesKey[]>(
  ASSET_ANALYTICS_SERIES.map(series => series.key),
)

const visibleWindows = $derived(
  ASSET_ANALYTICS_WINDOW_ORDER.filter(windowConfig =>
    visibleWindowKeys.includes(windowConfig.key),
  ),
)
const activeSeriesKeys = ASSET_ANALYTICS_SERIES.map(series => series.key)

const visibleWindowGridClass = $derived.by(() => {
  if (visibleWindows.length >= 4) {
    return 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4'
  }

  if (visibleWindows.length >= 3) {
    return 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
  }

  if (visibleWindows.length === 2) {
    return 'grid-cols-1 lg:grid-cols-2'
  }

  return 'grid-cols-1'
})

const windowErrors = $derived(
  analyticsState.status === 'success' || analyticsState.status === 'empty'
    ? ASSET_ANALYTICS_WINDOW_ORDER.flatMap(windowConfig => {
        const message = analyticsState.data?.windowErrors?.[windowConfig.key]?.trim()
        return message
          ? [{ key: windowConfig.key, label: windowConfig.label, message }]
          : []
      })
    : [],
)

const timeseriesPoints = $derived(
  analyticsState.status === 'success' || analyticsState.status === 'empty'
    ? (analyticsState.data?.windows['30d']?.timeseries30d ?? [])
    : [],
)

function toggleWindow(windowKey: AssetAnalyticsWindowKey): void {
  if (visibleWindowKeys.includes(windowKey)) {
    visibleWindowKeys = visibleWindowKeys.filter(key => key !== windowKey)
    return
  }

  const nextVisibleKeys = [...visibleWindowKeys, windowKey]
  visibleWindowKeys = ASSET_ANALYTICS_WINDOW_ORDER.map(({ key }) => key).filter(key =>
    nextVisibleKeys.includes(key),
  )
}

function toggleSeries(seriesKey: AssetAnalyticsSeriesKey): void {
  if (timelineSeriesKeys.includes(seriesKey)) {
    if (timelineSeriesKeys.length === 1) return
    timelineSeriesKeys = timelineSeriesKeys.filter(key => key !== seriesKey)
    return
  }

  const nextSeriesKeys = [...timelineSeriesKeys, seriesKey]
  timelineSeriesKeys = ASSET_ANALYTICS_SERIES.map(({ key }) => key).filter(key =>
    nextSeriesKeys.includes(key),
  )
}
</script>

{#snippet windowToggleControls()}
  {#each ASSET_ANALYTICS_WINDOW_ORDER as windowConfig}
    {@const isSelected = visibleWindowKeys.includes(windowConfig.key)}
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`Last ${windowConfig.label}`}
      onclick={() => toggleWindow(windowConfig.key)}
      class={cx(
        'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition',
        isSelected
          ? 'border-primary bg-primary text-primary-content'
          : 'border-white/12 bg-transparent text-foreground-alt hover:border-base-100 hover:text-foreground',
      )}
    >
      {windowConfig.label}
    </button>
  {/each}
{/snippet}

{#snippet analyticsWindowColumnHeaders(leftLabel: string)}
  <div class={cx('grid min-w-[min(100%,1240px)] gap-4', visibleWindowGridClass)}>
    {#each visibleWindows as windowConfig}
      <AnalyticsCardPrimitive.WindowHeader
        {leftLabel}
        rightLabel={windowConfig.label}
      />
    {/each}
  </div>
{/snippet}

<section class="bits-theme flex min-h-0 flex-col gap-5 pb-12">
  {#if analyticsState.status === 'error'}
    <AnalyticsCardPrimitive.EmptyState
      tone="error"
      title={m.analytics__state_unavailable_title()}
      description={analyticsState.message}
    />
  {:else if analyticsState.status === 'empty'}
    <AnalyticsCardPrimitive.EmptyState
      title={m.analytics__state_empty_title()}
      description={analyticsState.message}
    />
  {:else}
    <section class="space-y-4">
      {#if windowErrors.length > 0}
        <AnalyticsCardPrimitive.EmptyState
          tone="warning"
          title={m.analytics__state_partial_title()}
          description={windowErrors.map(windowError => `${windowError.label}: ${windowError.message}`).join(' ')}
        />
      {/if}

      <AssetAnalyticsDashboardPrimitive.TimelineCard
        {timeseriesPoints}
        {timelineSeriesKeys}
        onToggleSeries={toggleSeries}
      />

      <AnalyticsCardPrimitive.Root>
        <AnalyticsCardPrimitive.Header
          title="Cache & Latency"
          leftLabel="Windows"
          right={windowToggleControls}
          tooltip="Compare the same analytics metrics across fixed rolling windows without changing the active prism scope."
        />

        {#if visibleWindows.length === 0}
          <AnalyticsCardPrimitive.EmptyState
            class="mt-5"
            tone="subtle"
            title="No time dimensions selected"
            description="Select one or more windows to compare cache mix, latency, breakdowns, and leaders."
          />
        {:else}
          <div class="mt-5 space-y-4">
            {@render analyticsWindowColumnHeaders('Last')}

            <div
              class={cx('grid min-w-[min(100%,1240px)] gap-4', visibleWindowGridClass)}
            >
              {#each visibleWindows as windowConfig}
                <AssetAnalyticsDashboardPrimitive.WindowMetricsCard
                  windowData={analyticsState.data.windows[windowConfig.key]}
                  windowError={analyticsState.data.windowErrors[windowConfig.key] ?? null}
                  {activeSeriesKeys}
                />
              {/each}
            </div>
          </div>
        {/if}
      </AnalyticsCardPrimitive.Root>

      <AnalyticsCardPrimitive.Root>
        <AnalyticsCardPrimitive.Header
          title="Leaders"
          leftLabel="Top 25"
          right={windowToggleControls}
          tooltip="Top requested transformations and assets for the selected analytics windows."
        />

        {#if visibleWindows.length === 0}
          <AnalyticsCardPrimitive.EmptyState
            class="mt-5"
            tone="subtle"
            title="No time dimensions selected"
            description="Select one or more windows to compare the top transformations and assets."
          />
        {:else}
          <div class="mt-5 space-y-4">
            {@render analyticsWindowColumnHeaders('Last')}

            {#each TOP_WINDOW_SECTION_ORDER as sectionKind}
              <div
                class={cx('grid min-w-[min(100%,1240px)] gap-4', visibleWindowGridClass)}
              >
                {#each visibleWindows as windowConfig}
                  <AssetAnalyticsDashboardPrimitive.RankedWindowSectionCard
                    kind={sectionKind}
                    windowData={analyticsState.data.windows[windowConfig.key]}
                    windowError={analyticsState.data.windowErrors[windowConfig.key] ?? null}
                    assetEnvironment={analyticsState.data.environment}
                  />
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </AnalyticsCardPrimitive.Root>

      <AnalyticsCardPrimitive.Root>
        <AnalyticsCardPrimitive.Header
          title="Failures"
          leftLabel="4XX/5XX"
          right={windowToggleControls}
          tooltip="Requested assets that failed for the selected analytics windows."
        />

        {#if visibleWindows.length === 0}
          <AnalyticsCardPrimitive.EmptyState
            class="mt-5"
            tone="subtle"
            title="No time dimensions selected"
            description="Select one or more windows to compare missing-image and 5xx failures."
          />
        {:else}
          <div class="mt-5 space-y-4">
            {@render analyticsWindowColumnHeaders('Last')}

            {#each FAILURE_WINDOW_SECTION_ORDER as sectionKind}
              <div
                class={cx('grid min-w-[min(100%,1240px)] gap-4', visibleWindowGridClass)}
              >
                {#each visibleWindows as windowConfig}
                  <AssetAnalyticsDashboardPrimitive.RankedWindowSectionCard
                    kind={sectionKind}
                    windowData={analyticsState.data.windows[windowConfig.key]}
                    windowError={analyticsState.data.windowErrors[windowConfig.key] ?? null}
                    assetEnvironment={analyticsState.data.environment}
                  />
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </AnalyticsCardPrimitive.Root>

      <div class="h-12" aria-hidden="true"></div>
    </section>
  {/if}
</section>
