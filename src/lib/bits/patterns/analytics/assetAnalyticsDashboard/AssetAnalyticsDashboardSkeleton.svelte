<script lang="ts">
// BITS
import { AnalyticsCardPrimitive } from '$lib/bits'
// I18N
import { m } from '$lib/i18n'
// LOCAL
import {
  ASSET_ANALYTICS_SERIES,
  DEFAULT_VISIBLE_WINDOWS,
  FAILURE_WINDOW_SECTION_ORDER,
  TOP_WINDOW_SECTION_ORDER,
  getAssetAnalyticsSeriesLabel,
} from './assetAnalyticsDashboard.utils'

const WINDOW_KEYS = [...DEFAULT_VISIBLE_WINDOWS]
const WINDOW_GRID_CLASS = 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
</script>

{#snippet skeletonBlock(className: string)}
  <AnalyticsCardPrimitive.SkeletonBlock
    class={`analytics-loading-block relative overflow-hidden ${className}`}
  />
{/snippet}

{#snippet loadingPill(label: string, className = 'h-8 w-14')}
  <div class="relative">
    {@render skeletonBlock(`${className} rounded-full border border-white/10 bg-[#161616]`)}
    <span class="sr-only">{label}</span>
  </div>
{/snippet}

{#snippet windowToggleControls()}
  {#each ['1h', '24h', '7d', '30d'] as windowKey}
    {@render loadingPill(windowKey)}
  {/each}
{/snippet}

{#snippet analyticsWindowColumnHeaders(leftLabel: string)}
  <div class={`grid min-w-[min(100%,1240px)] gap-4 ${WINDOW_GRID_CLASS}`}>
    {#each WINDOW_KEYS as windowKey}
      <AnalyticsCardPrimitive.WindowHeader {leftLabel} rightLabel={windowKey} />
    {/each}
  </div>
{/snippet}

{#snippet timelineLegend()}
  <div
    class="mb-4 flex flex-wrap items-center justify-center gap-2 text-xs uppercase tracking-[0.18em]"
  >
    {#each ASSET_ANALYTICS_SERIES as series}
      <div
        class="flex min-w-[8rem] items-center justify-center gap-2 bg-transparent px-3 py-1.5 text-foreground-alt"
      >
        <span
          class={`h-2.5 w-2.5 rounded-full ${series.textColorClass.replace('text-', 'bg-')}`}
        ></span>
        <span>{getAssetAnalyticsSeriesLabel(series.key)}</span>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet timelineLoadingChart()}
  <div class="rounded-[1.4rem] border border-white/10 bg-[#151515] p-4 pt-8">
    <div class="relative h-64 rounded-[1rem]" aria-hidden="true">
      <div
        class="pointer-events-none absolute inset-x-0 -translate-y-5 flex justify-center"
      >
        <div
          class="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground-alt backdrop-blur"
        >
          <span class="analytics-loading-dot h-2 w-2 rounded-full bg-primary"></span>
          Loading
        </div>
      </div>

      <div class="pointer-events-none absolute inset-x-6 bottom-10 top-5">
        {#each [0.25, 0.5, 0.75, 1] as marker}
          <div
            class="absolute inset-x-0 border-t border-white/10"
            style={`top: ${(1 - marker) * 100}%`}
          ></div>
        {/each}

        <div
          class="analytics-loading-sheen absolute inset-y-0 left-[8%] w-20 rounded-full bg-white/8 blur-2xl"
        ></div>

        <div
          class="absolute inset-x-0 bottom-0 top-0 flex items-end justify-between gap-3"
        >
          {#each Array.from({ length: 14 }) as _, index}
            <div class="flex flex-1 items-end justify-center gap-1">
              {#each [
                'bg-primary',
                'bg-secondary',
                'bg-accent',
                'bg-warning',
                'bg-error',
              ] as colorClass, colorIndex}
                <div
                  class={`analytics-loading-bar w-full rounded-t-sm ${colorClass}`}
                  style={`height: ${24 + ((index * 19 + colorIndex * 13) % 132)}px; animation-delay: ${(index + colorIndex) * 80}ms; opacity: ${colorIndex >= 3 ? 0.78 : 0.92};`}
                ></div>
              {/each}
            </div>
          {/each}
        </div>
      </div>

      <div
        class="absolute inset-x-4 bottom-3 grid grid-cols-7 gap-3 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground-alt"
      >
        {#each ['Mar 1', 'Mar 5', 'Mar 9', 'Mar 13', 'Mar 17', 'Mar 21', 'Mar 25'] as label}
          <span>{label}</span>
        {/each}
      </div>
    </div>
  </div>
{/snippet}

{#snippet metricWindowCard(windowKey: string)}
  <section class="flex min-h-0 flex-col gap-4">
    <div class="grid grid-cols-2 gap-3">
      {#each [0, 1, 2, 3, 4, 5] as statIndex}
        <article
          class="flex min-h-[5.9rem] flex-col justify-between rounded-[1.2rem] border border-white/10 bg-[#121212] px-3 py-3"
        >
          {@render skeletonBlock('h-3 w-20 rounded-full')}
          {@render skeletonBlock('h-8 w-18 rounded-full')}
          <span class="sr-only">{windowKey}-metric-{statIndex}</span>
        </article>
      {/each}
    </div>

    <section
      class="space-y-4 rounded-[1.25rem] border border-white/10 bg-[#121212] p-4"
    >
      <div class="flex items-center gap-2">
        {@render skeletonBlock('h-4 w-20 rounded-full')}
        {@render skeletonBlock('h-5 w-5 rounded-full')}
      </div>

      <div class="space-y-4">
        {#each ['p50', 'p95', 'p99'] as tier, tierIndex}
          <div class="space-y-2">
            {@render skeletonBlock('h-3 w-10 rounded-full')}

            {#each [0, 1, 2] as rowIndex}
              <div class="grid grid-cols-[88px_1fr_auto] items-center gap-3">
                {@render skeletonBlock('h-3 w-16 rounded-full')}
                <div class="h-2.5 overflow-hidden rounded-full bg-white/6">
                  <div
                    class="analytics-loading-bar h-full rounded-full bg-primary"
                    style={`width: ${38 + ((tierIndex * 31 + rowIndex * 19) % 48)}%; animation-delay: ${(tierIndex * 3 + rowIndex) * 110}ms;`}
                  ></div>
                </div>
                {@render skeletonBlock('h-3 w-12 rounded-full')}
              </div>
            {/each}

            <span class="sr-only">{windowKey}-{tier}</span>
          </div>
        {/each}
      </div>
    </section>

    <section
      class="space-y-5 rounded-[1.25rem] border border-white/10 bg-[#121212] p-4"
    >
      <div class="flex items-center gap-2">
        {@render skeletonBlock('h-4 w-32 rounded-full')}
        {@render skeletonBlock('h-5 w-5 rounded-full')}
      </div>

      <div class="grid gap-x-4 gap-y-8 pb-2 xl:grid-cols-2">
        {#each ['Crop', 'Formats', 'Dimensions', 'Quality'] as breakdown, breakdownIndex}
          <article class="min-w-0">
            <div class="mb-4 flex items-center justify-between gap-3">
              {@render skeletonBlock('h-4 w-18 rounded-full')}
              {@render skeletonBlock('h-3 w-8 rounded-full')}
            </div>

            <div class="space-y-3">
              {#each [0, 1, 2, 3] as rowIndex}
                <div class="space-y-1.5">
                  <div class="flex items-center justify-between gap-3">
                    {@render skeletonBlock('h-4 w-24 rounded-full')}
                    {@render skeletonBlock('h-3 w-10 rounded-full')}
                  </div>

                  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div class="h-2 overflow-hidden rounded-full bg-white/6">
                      <div
                        class="analytics-loading-bar h-full rounded-full bg-primary"
                        style={`width: ${34 + ((breakdownIndex * 17 + rowIndex * 11) % 58)}%; animation-delay: ${(breakdownIndex * 4 + rowIndex) * 90}ms;`}
                      ></div>
                    </div>
                    {@render skeletonBlock('h-3 w-10 rounded-full')}
                  </div>
                </div>
              {/each}
            </div>

            <span class="sr-only">{windowKey}-{breakdown}</span>
          </article>
        {/each}
      </div>
    </section>
  </section>
{/snippet}

{#snippet rankedWindowSectionCard(kind: string, windowKey: string)}
  <section
    class="min-h-0 rounded-[1.4rem] border border-white/10 bg-[#121212] px-4 pt-4 pb-6"
  >
    <div class="mb-3 flex items-start justify-between gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        {@render skeletonBlock('h-4 w-28 rounded-full')}
        {@render skeletonBlock('h-5 w-5 rounded-full')}
      </div>
      {@render skeletonBlock('h-3 w-8 rounded-full')}
    </div>

    <div class="space-y-3">
      {#each [0, 1, 2, 3, 4, 5] as rowIndex}
        <div
          class="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-3 border-t border-white/8 pt-3 first:border-t-0 first:pt-0"
        >
          {#if kind === 'transformations'}
            <div class="flex flex-wrap gap-1.5">
              {#each [0, 1, 2] as badgeIndex}
                {@render skeletonBlock('h-7 w-18 rounded-full border border-white/10 bg-[#161616]')}
                <span class="sr-only">{windowKey}-{rowIndex}-{badgeIndex}</span>
              {/each}
            </div>
          {:else}
            <div class="space-y-2">
              {@render skeletonBlock('h-4 w-full max-w-[15rem] rounded-full')}
              {@render skeletonBlock('h-3 w-24 rounded-full')}
            </div>
          {/if}

          {@render skeletonBlock('justify-self-end h-3 w-12 rounded-full')}
        </div>
      {/each}
    </div>
  </section>
{/snippet}

<section
  class="bits-theme flex min-h-0 flex-col gap-5 pb-12"
  data-testid="analytics-loading-state"
>
  <AnalyticsCardPrimitive.Root>
    <AnalyticsCardPrimitive.Header
      title={m.analytics__timeline_title()}
      leftLabel={m.analytics__timeline_left_label()}
      rightLabel={m.analytics__timeline_right_label()}
      tooltip=""
    />

    <div class="mt-5">
      {@render timelineLegend()}
      {@render timelineLoadingChart()}
    </div>
  </AnalyticsCardPrimitive.Root>

  <AnalyticsCardPrimitive.Root>
    <AnalyticsCardPrimitive.Header
      title="Cache & Latency"
      leftLabel="Windows"
      right={windowToggleControls}
      tooltip=""
    />

    <div class="mt-5 space-y-4">
      {@render analyticsWindowColumnHeaders('Last')}

      <div class={`grid min-w-[min(100%,1240px)] gap-4 ${WINDOW_GRID_CLASS}`}>
        {#each WINDOW_KEYS as windowKey}
          {@render metricWindowCard(windowKey)}
        {/each}
      </div>
    </div>
  </AnalyticsCardPrimitive.Root>

  <AnalyticsCardPrimitive.Root>
    <AnalyticsCardPrimitive.Header
      title="Leaders"
      leftLabel="Top 25"
      right={windowToggleControls}
      tooltip=""
    />

    <div class="mt-5 space-y-4">
      {@render analyticsWindowColumnHeaders('Last')}

      {#each TOP_WINDOW_SECTION_ORDER as sectionKind}
        <div class={`grid min-w-[min(100%,1240px)] gap-4 ${WINDOW_GRID_CLASS}`}>
          {#each WINDOW_KEYS as windowKey}
            {@render rankedWindowSectionCard(sectionKind, windowKey)}
          {/each}
        </div>
      {/each}
    </div>
  </AnalyticsCardPrimitive.Root>

  <AnalyticsCardPrimitive.Root>
    <AnalyticsCardPrimitive.Header
      title="Failures"
      leftLabel="4XX/5XX"
      right={windowToggleControls}
      tooltip=""
    />

    <div class="mt-5 space-y-4">
      {@render analyticsWindowColumnHeaders('Last')}

      {#each FAILURE_WINDOW_SECTION_ORDER as sectionKind}
        <div class={`grid min-w-[min(100%,1240px)] gap-4 ${WINDOW_GRID_CLASS}`}>
          {#each WINDOW_KEYS as windowKey}
            {@render rankedWindowSectionCard(sectionKind, windowKey)}
          {/each}
        </div>
      {/each}
    </div>
  </AnalyticsCardPrimitive.Root>

  <div class="h-12" aria-hidden="true"></div>
</section>

<style>
.analytics-loading-block {
  position: relative;
}

.analytics-loading-block::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.08) 45%,
    rgba(255, 255, 255, 0.14) 50%,
    rgba(255, 255, 255, 0.08) 55%,
    transparent 100%
  );
  animation: analytics-skeleton-sweep 1.8s ease-in-out infinite;
}

.analytics-loading-bar {
  animation: analytics-skeleton-breathe 1.8s ease-in-out infinite;
  transform-origin: bottom center;
}

.analytics-loading-dot {
  animation: analytics-skeleton-pulse 1.1s ease-in-out infinite;
}

.analytics-loading-sheen {
  animation: analytics-skeleton-drift 3.2s ease-in-out infinite;
}

@keyframes analytics-skeleton-sweep {
  100% {
    transform: translateX(100%);
  }
}

@keyframes analytics-skeleton-breathe {
  0%,
  100% {
    opacity: 0.62;
    transform: scaleY(0.94);
  }

  50% {
    opacity: 1;
    transform: scaleY(1);
  }
}

@keyframes analytics-skeleton-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.9);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes analytics-skeleton-drift {
  0%,
  100% {
    transform: translateX(-18%);
    opacity: 0.12;
  }

  50% {
    transform: translateX(18%);
    opacity: 0.32;
  }
}
</style>
