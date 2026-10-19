<script lang="ts">
// BITS
import * as Card from '#lib/bits/custom/analyticsCard/components/index.js'
// LOCAL
import {
  ASSET_ANALYTICS_WINDOW_ORDER,
  DEFAULT_VISIBLE_WINDOWS,
} from '../assetAnalyticsDashboard/assetAnalyticsDashboard.utils'
import { PLATFORM_ANALYTICS_PRESENTATION } from './platformAnalyticsDashboard.config'
// TYPES
import type { PlatformAnalyticsFacet } from '#lib/api/services/platformAnalytics.types.js'

let { facet }: { facet: PlatformAnalyticsFacet } = $props()
const presentation = $derived(PLATFORM_ANALYTICS_PRESENTATION[facet])
const gridClass = 'grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3'
</script>

{#snippet controls()}
  {#each ASSET_ANALYTICS_WINDOW_ORDER as window}
    <Card.SkeletonBlock class="h-8 w-14 rounded-full motion-safe:animate-pulse" />
  {/each}
{/snippet}

<section
  class="bits-theme flex min-h-0 flex-col gap-4 pb-12"
  aria-busy="true"
  aria-label={`Loading ${facet} analytics`}
  data-testid="analytics-loading-state"
>
  <span class="sr-only" role="status">Loading {facet} analytics</span>
  <Card.Root>
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="space-y-2">
        <Card.SkeletonBlock
          class="h-4 w-64 max-w-full rounded-full motion-safe:animate-pulse"
        />
        <Card.SkeletonBlock class="h-4 w-40 rounded-full motion-safe:animate-pulse" />
      </div>
      {#if facet !== 'data'}
        <div class="flex items-center gap-3 text-sm text-foreground">
          Hostname
          <Card.SkeletonBlock class="h-10 w-40 rounded-lg motion-safe:animate-pulse" />
        </div>
      {/if}
    </div>
  </Card.Root>

  <Card.Root>
    <Card.Header
      title={presentation.timeline}
      leftLabel="Trend"
      rightLabel="Last 30 days"
    />
    <div class="mt-5 rounded-[1.4rem] border border-foreground/10 bg-surface p-4 pt-8">
      <Card.SkeletonBlock
        class="h-64 w-full rounded-[1rem] motion-safe:animate-pulse"
      />
    </div>
  </Card.Root>

  <Card.Root>
    <Card.Header title={presentation.overview} leftLabel="Windows" right={controls} />
    <div class={`mt-5 ${gridClass}`}>
      {#each DEFAULT_VISIBLE_WINDOWS as window}
        <section class="min-w-0 space-y-4">
          <Card.WindowHeader leftLabel="Last" rightLabel={window} />
          <div class="grid grid-cols-2 gap-3">
            {#each Array.from({ length: presentation.metricCount }) as _}
              <article
                class="space-y-3 rounded-[1.2rem] border border-border bg-surface px-3 py-3"
              >
                <Card.SkeletonBlock
                  class="h-3 w-20 max-w-full rounded-full motion-safe:animate-pulse"
                />
                <Card.SkeletonBlock
                  class="h-8 w-24 max-w-full rounded-full motion-safe:animate-pulse"
                />
              </article>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </Card.Root>

  <Card.Root>
    <Card.Header title={presentation.rankings} leftLabel="Top 25" right={controls} />
    <div class="mt-5 space-y-4">
      <div class={gridClass}>
        {#each DEFAULT_VISIBLE_WINDOWS as window}
          <Card.WindowHeader leftLabel="Last" rightLabel={window} />
        {/each}
      </div>
      {#each presentation.sections as title}
        <div class={gridClass}>
          {#each DEFAULT_VISIBLE_WINDOWS as window}
            <section
              class="min-w-0 space-y-4 rounded-[1.25rem] border border-border bg-surface p-4"
            >
              <Card.SectionHeader {title} />
              {#each Array.from({ length: 5 }) as _}
                <div
                  class="grid grid-cols-[minmax(0,1fr)_3rem_2rem] gap-3 border-t border-border pt-3"
                >
                  <Card.SkeletonBlock
                    class="h-4 w-full max-w-40 rounded-full motion-safe:animate-pulse"
                  />
                  <Card.SkeletonBlock
                    class="h-4 rounded-full motion-safe:animate-pulse"
                  />
                  <Card.SkeletonBlock
                    class="h-4 rounded-full motion-safe:animate-pulse"
                  />
                </div>
              {/each}
            </section>
          {/each}
        </div>
      {/each}
    </div>
  </Card.Root>
</section>
