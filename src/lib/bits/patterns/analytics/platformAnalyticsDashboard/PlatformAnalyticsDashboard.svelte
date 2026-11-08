<script lang="ts">
// BITS
import * as Card from '#lib/bits/custom/analyticsCard/components/index.js'
import { cx } from '#lib/bits/utils.js'
// LOCAL
import { PLATFORM_ANALYTICS_PRESENTATION } from './platformAnalyticsDashboard.config'
import {
  ASSET_ANALYTICS_WINDOW_ORDER,
  DEFAULT_VISIBLE_WINDOWS,
  formatAnalyticsCount,
} from '../assetAnalyticsDashboard/assetAnalyticsDashboard.utils'
// TYPES
import type { AssetAnalyticsWindowKey } from '#lib/api/services/assetAnalytics.types.js'
import type {
  PlatformAnalyticsFacet,
  PlatformAnalyticsResult,
} from '#lib/api/services/platformAnalytics.types.js'

let {
  state: analyticsState,
  facet,
}: {
  state: PlatformAnalyticsResult
  facet: PlatformAnalyticsFacet
} = $props()
const presentation = $derived(PLATFORM_ANALYTICS_PRESENTATION[facet])
let selected = $state<AssetAnalyticsWindowKey[]>([...DEFAULT_VISIBLE_WINDOWS])
const windows = $derived(
  ASSET_ANALYTICS_WINDOW_ORDER.filter(window => selected.includes(window.key)),
)
const grid = $derived(
  windows.length >= 4
    ? 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4'
    : windows.length === 3
      ? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
      : windows.length === 2
        ? 'grid-cols-1 lg:grid-cols-2'
        : 'grid-cols-1',
)
const timeline = $derived(
  analyticsState.status === 'success'
    ? analyticsState.data.windows['30d'].timeline
    : [],
)
const maximum = $derived(Math.max(1, ...timeline.map(point => point.value)))
const sectionTitles = $derived(
  analyticsState.status === 'success'
    ? [
        ...new Set(
          Object.values(analyticsState.data.windows).flatMap(window =>
            window.rankings.map(section => section.title),
          ),
        ),
      ]
    : [],
)
</script>

{#snippet controls()}
  {#each ASSET_ANALYTICS_WINDOW_ORDER as window}
    <button
      type="button"
      aria-pressed={selected.includes(window.key)}
      aria-label={`Last ${window.label}`}
      onclick={() =>
        (selected = selected.includes(window.key)
          ? selected.filter(key => key !== window.key)
          : [...selected, window.key])}
      class={cx(
        'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition',
        selected.includes(window.key)
          ? 'border-primary bg-primary text-primary-content'
          : 'border-foreground/12 bg-transparent text-foreground-alt hover:border-base-100 hover:text-foreground',
      )}
    >
      {window.label}
    </button>
  {/each}
{/snippet}

<section class="bits-theme flex min-h-0 flex-col gap-4 pb-12">
  {#if analyticsState.status === 'error'}
    <Card.EmptyState
      tone="error"
      title="Analytics unavailable"
      description={analyticsState.message}
    />
  {:else}
    {#if Object.values(analyticsState.data.windows).some(window => window.error)}
      <Card.EmptyState
        tone="warning"
        title="Partial analytics data"
        description={Object.entries(analyticsState.data.windows)
          .filter(([, window]) => window.error)
          .map(([key, window]) => `${key}: ${window.error}`)
          .join(' ')}
      />
    {/if}
    <Card.Root>
      <Card.Header
        title={presentation.timeline}
        leftLabel="Trend"
        rightLabel="Last 30 days"
        tooltip={facet === 'data'
          ? 'Daily read and write query totals for the production D1 database.'
          : 'Daily page loads reported by Cloudflare Web Analytics. Counts may be sampled; these are not unique people.'}
      />
      {#if timeline.length === 0}
        <Card.EmptyState
          class="mt-5"
          title="No 30-day time series available"
          description={analyticsState.data.windows['30d'].error ??
            'No activity was recorded in this period.'}
        />
      {:else}
        <div
          class="border-foreground/10 bg-surface mt-5 overflow-x-auto rounded-[1.4rem] border p-4 pt-8"
        >
          <svg
            class="h-64 w-full min-w-[720px]"
            viewBox="0 0 840 244"
            role="img"
            aria-label={`Daily ${facet === 'data' ? 'database queries' : 'page views'} over the last 30 days`}
          >
            {#each [0.25, 0.5, 0.75, 1] as marker}
              <line
                x1="0"
                x2="840"
                y1={216 - marker * 216}
                y2={216 - marker * 216}
                stroke="currentColor"
                opacity="0.14"
              />
            {/each}
            {#each timeline as point, i}
              <rect
                x={(i * 840) / timeline.length + 4}
                y={216 - (point.value / maximum) * 216}
                width={Math.max(1, 840 / timeline.length - 8)}
                height={(point.value / maximum) * 216}
                fill="var(--color-primary)"
              >
                <title>{point.date}: {formatAnalyticsCount(point.value)}</title>
              </rect>
              {#if i % Math.max(1, Math.ceil(timeline.length / 7)) === 0 ||
                i === timeline.length - 1}
                <text
                  x={((i + 0.5) * 840) / timeline.length}
                  y="236"
                  text-anchor="middle"
                  fill="currentColor"
                  font-size="10"
                >
                  {point.date.slice(5)}
                </text>
              {/if}
            {/each}
          </svg>
          <details class="text-foreground-alt mt-2 text-xs">
            <summary>Daily values</summary>
            <table class="mt-2 w-full">
              <tbody>
                {#each timeline as point}
                  <tr>
                    <th class="text-left">{point.date}</th>
                    <td class="text-right">{formatAnalyticsCount(point.value)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </details>
        </div>
      {/if}
    </Card.Root>
    <Card.Root>
      <Card.Header
        title={presentation.overview}
        leftLabel="Windows"
        right={controls}
        tooltip="Compare fixed rolling windows with the same scope and snapshot time."
      />
      {#if windows.length === 0}
        <Card.EmptyState
          class="mt-5"
          title="No time dimensions selected"
          description="Select one or more windows to compare metrics and breakdowns."
        />
      {:else}
        <div class={cx('mt-5 grid gap-4', grid)}>
          {#each windows as window}
            {@const data = analyticsState.data.windows[window.key]}
            <section class="min-w-0 space-y-4">
              <Card.WindowHeader leftLabel="Last" rightLabel={window.label} />
              {#if data.metrics.length === 0}
                <Card.EmptyState
                  title="Window unavailable"
                  description={data.error ?? 'No metrics available.'}
                />
              {/if}
              <div class="grid grid-cols-2 gap-3">
                {#each data.metrics as metric}
                  <article
                    class="border-border bg-surface rounded-[1.2rem] border px-3 py-3"
                  >
                    <p
                      class="text-foreground-alt text-[11px] font-semibold tracking-[0.18em] uppercase"
                    >
                      {metric.label}
                    </p>
                    <p class="text-foreground mt-2 text-2xl font-semibold break-words">
                      {metric.value === null
                        ? '—'
                        : metric.unit === 'ms'
                          ? `${metric.value.toFixed(1)} ms`
                          : metric.unit === 'bytes'
                            ? `${(metric.value / 1048576).toFixed(1)} MiB`
                            : formatAnalyticsCount(metric.value)}
                    </p>
                  </article>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {/if}
      <p class="text-foreground-alt mt-5 text-xs leading-5">
        {facet === 'data'
          ? 'Latency measures query batches. Queue writes, reads and deletions are operations, not backlog or completed jobs. Storage growth and pipeline failures are not available from these datasets.'
          : 'Cloudflare Web Analytics counts recorded page loads and visits, not unique people. Audience distributions are weighted by page views. Core Web Vitals are not included in this dataset.'}
      </p>
    </Card.Root>
    <Card.Root>
      <Card.Header
        title={presentation.rankings}
        leftLabel="Top 25"
        right={controls}
        tooltip="Ranked counts for each selected window. Shares are relative to the rows shown, not the entire dataset."
      />
      {#if windows.length === 0}
        <Card.EmptyState
          class="mt-5"
          title="No time dimensions selected"
          description="Select a window to see ranked breakdowns."
        />
      {:else}
        <div class="mt-5 space-y-4">
          <div class={cx('grid gap-4', grid)}>
            {#each windows as window}
              <Card.WindowHeader leftLabel="Last" rightLabel={window.label} />
            {/each}
          </div>
          {#each sectionTitles as title}
            <div class={cx('grid gap-4', grid)}>
              {#each windows as window}
                {@const section = analyticsState.data.windows[window.key].rankings.find(
                  row => row.title === title,
                )}
                {@const total =
                  section?.rows.reduce((sum, row) => sum + row.value, 0) ?? 0}
                <section
                  class="border-border bg-surface min-w-0 space-y-4 rounded-[1.25rem] border p-4"
                >
                  <Card.SectionHeader
                    {title}
                    tooltip="Top reported values, descending by count. Percentages are shares of displayed rows."
                  />
                  {#if section?.error || !section}
                    <Card.EmptyState
                      title="Section unavailable"
                      description={section?.error ??
                        analyticsState.data.windows[window.key].error ??
                        'No section available.'}
                    />
                  {:else if section.rows.length === 0}
                    <p class="text-foreground-alt text-sm">No activity recorded.</p>
                  {:else}
                    <table class="w-full table-fixed text-xs">
                      <thead>
                        <tr class="text-foreground-alt">
                          <th class="pb-3 text-left">Name</th>
                          <th class="w-20 pb-3 text-right">Count</th>
                          <th class="w-14 pb-3 text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each section.rows as row}
                          <tr class="border-border border-t">
                            <td class="py-3 pr-2 break-all" data-tooltip={row.label}>
                              {row.label}
                            </td>
                            <td class="text-right font-mono">
                              {formatAnalyticsCount(row.value)}
                            </td>
                            <td class="text-right font-mono">
                              {total ? ((row.value / total) * 100).toFixed(1) : '0'}%
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                </section>
              {/each}
            </div>
          {/each}
        </div>
      {/if}
    </Card.Root>
  {/if}
</section>
