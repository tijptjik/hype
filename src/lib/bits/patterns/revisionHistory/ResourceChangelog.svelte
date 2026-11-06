<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
// COMPONENTS
import HistoryValue from './components/HistoryValue.svelte'
import ChangelogFiltersBar from './components/ChangelogFilters.svelte'
import ChangelogActor from './components/ChangelogActor.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import Header from '#lib/bits/custom/header/Header.svelte'
import { VirtualList } from '#lib/bits/custom/index/src/index.js'
// ICONS
import HistoryIcon from 'virtual:icons/proicons/history'
import FilterIcon from 'virtual:icons/proicons/filter'
import RefreshIcon from 'virtual:icons/proicons/arrow-sync'
// PRESENTATION
import { fieldLabel, historyOperation } from './presentation'
import { featureReviewLabel } from '#lib/revisions/featureReviewDisplay.js'
import {
  changelogTimeBoundaries,
  changelogTimeBoundaryLabel,
  changelogCheckBoundary,
} from '#lib/revisions/changelogTimeline.js'
// TYPES
import type {
  ChangelogCursor,
  ChangelogEntry,
  ChangelogPage,
  ChangelogFilters,
  ChangelogFilterOptions,
} from '#lib/revisions/changelog.js'

let {
  identity,
  locale,
  loadPage,
  onLoaded,
  lastCheckedAt = null,
}: {
  identity: string
  locale: string
  loadPage: (
    before?: ChangelogCursor,
    filters?: ChangelogFilters,
    includeFilterOptions?: boolean,
  ) => Promise<ChangelogPage>
  onLoaded?: (page: ChangelogPage) => void
  lastCheckedAt?: string | null
} = $props()
let filters = $state<ChangelogFilters>({})
let showFilters = $state(false)
let pendingFilters = $state(false)
let filterOptions = $state<ChangelogFilterOptions | null>(null)
let optionsIdentity: string | null = null
const filterCount = $derived(
  Object.values(filters).filter(value => value !== undefined && value !== '').length,
)
let result = $state<ChangelogPage | null>(null)
let loading = $state(true)
let failed = $state(false)
let entries = $state<ChangelogEntry[]>([])
let nextCursor = $state<ChangelogCursor | null>(null)
let visibleEnd = $state(0)
let feedVersion = $state(0)
let expanded = $state<Record<string, boolean>>({})
let generation = 0
let now = $state(new Date())
const timeBoundaries = $derived(changelogTimeBoundaries(entries, now))
const checkBoundary = $derived(
  changelogCheckBoundary(entries, lastCheckedAt, nextCursor !== null),
)

onMount(() => {
  now = new Date()
  const timer = setInterval(() => {
    now = new Date()
  }, 30_000)
  return () => clearInterval(timer)
})

/** Format a live, localized age while retaining exact timestamps on hover.
 * @param value Immutable recorded timestamp.
 * @returns Relative time in the selected user locale.
 */
function relative(value: string): string {
  const seconds = (new Date(value).getTime() - now.getTime()) / 1000
  if (!Number.isFinite(seconds)) return 'Unknown time'
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ]
  const [unit, size] =
    units.find(([, size]) => Math.abs(seconds) >= size) ?? units.at(-1)!
  return new Intl.RelativeTimeFormat(
    locale === 'zhHant' ? 'zh-Hant' : locale === 'zhHans' ? 'zh-Hans' : locale,
    { numeric: 'auto' },
  ).format(Math.round(seconds / size), unit)
}

/** Append a bounded page without replacing mounted rows or their disclosure state.
 * @param reset Whether to refresh the feed from its newest entries.
 * @param refreshOptions Whether to refresh unfiltered attribution and date bounds.
 * @returns Completion after the current request settles.
 * @remarks Resource, locale and account changes invalidate in-flight requests. A failed
 * continuation keeps loaded entries and retries the same cursor only on explicit input.
 */
async function load(reset = false, refreshOptions = false): Promise<void> {
  if (!reset && (loading || !nextCursor)) return
  const request = ++generation
  const before = reset ? undefined : nextCursor!
  if (reset) {
    entries = []
    result = null
    nextCursor = null
    visibleEnd = 0
    expanded = {}
    feedVersion++
  }
  loading = true
  failed = false
  try {
    const currentOptionsIdentity = `${identity}:${locale}`
    const value = await loadPage(
      before,
      $state.snapshot(filters),
      refreshOptions || optionsIdentity !== currentOptionsIdentity,
    )

    if (request !== generation) return
    if (
      before &&
      value.nextCursor?.key === before.key &&
      value.nextCursor.createdAt === before.createdAt
    )
      throw new Error('Changelog continuation did not advance')
    const known = new Set(entries.map(entry => entry.key))
    entries = [...entries, ...value.entries.filter(entry => !known.has(entry.key))]
    if (value.filterOptions) {
      filterOptions = value.filterOptions
      optionsIdentity = currentOptionsIdentity
    }
    nextCursor = value.nextCursor
    result = value
    onLoaded?.(value)
  } catch {
    if (request === generation) failed = true
  } finally {
    if (request === generation) loading = false
  }
}

/** Summarize known operations once each while retaining all differences on expansion.
 * @param entry Authorized immutable entry.
 * @returns Compact operation labels.
 */
function operations(entry: ChangelogEntry): string {
  if (entry.baseline) return 'Initial snapshot'
  if (entry.unpublished) return 'Unpublished'
  if (entry.initial)
    return entry.category === 'publication'
      ? 'Published'
      : entry.category === 'fields'
        ? 'New field'
        : 'New record'
  const labels = [
    ...new Set(
      entry.changes.map(
        change => historyOperation(change, entry.category === 'fields').label,
      ),
    ),
  ]
  return labels.length
    ? labels.join(' · ')
    : entry.redacted
      ? 'Restricted changes'
      : 'Updated record'
}

/** Format a timestamp using the selected locale.
 * @param value Immutable change time.
 * @returns Local date and time.
 */
function timestamp(value: string): string {
  return new Date(value).toLocaleString(
    locale === 'zhHant' ? 'zh-Hant' : locale === 'zhHans' ? 'zh-Hans' : locale,
    { dateStyle: 'medium', timeStyle: 'short' },
  )
}

$effect(() => {
  identity
  untrack(() => {
    filters = {}
    filterOptions = null
    optionsIdentity = null
  })
})

$effect(() => {
  identity
  locale
  filters
  untrack(() => {
    pendingFilters = true
  })
  const timer = setTimeout(
    () =>
      untrack(() => {
        pendingFilters = false
        void load(true)
      }),
    200,
  )
  return () => {
    clearTimeout(timer)
    generation++
  }
})

// Match the Features index's visible-range prefetch, including empty authorized pages.
$effect(() => {
  if (
    !pendingFilters &&
    !loading &&
    !failed &&
    nextCursor &&
    visibleEnd >= entries.length - 8
  )
    untrack(() => {
      void load()
    })
})
</script>

{#snippet lastCheckedBar()}
  {#if lastCheckedAt}
    <!-- biome-ignore lint/a11y/useSemanticElements: This labeled separator contains a visible timestamp, which an hr cannot contain. -->
    <div
      data-last-checked
      role="separator"
      aria-label={`Last checked ${timestamp(lastCheckedAt)}`}
      title={timestamp(lastCheckedAt)}
      class="flex items-center gap-2 border-y border-blue-500/50 bg-blue-500/15 px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-300"
    >
      <span
        >{locale === 'zhHant'
          ? '上次查看'
          : locale === 'zhHans'
            ? '上次查看'
            : 'Last checked'}</span
      >
      <span aria-hidden="true">·</span>
      <time datetime={lastCheckedAt}>{relative(lastCheckedAt)}</time>
    </div>
  {/if}
{/snippet}

<section
  class="flex h-full min-h-0 w-full min-w-0 flex-col"
  aria-label="Changelog"
  aria-busy={loading || pendingFilters}
>
  <SectionHeader
    actions={[
      {
        text: filterCount ? `Filters (${filterCount})` : 'Filters',
        iconComponent: FilterIcon,
        hideLabel: true,
        hideLabelInstantly: true,
        style: 'ghost',
        color: 'neutral',
        attrs: {
          'aria-expanded': showFilters,
          'aria-pressed': showFilters,
          'aria-label': filterCount ? `Filters, ${filterCount} active` : 'Filters',
        },
        class: filterCount || showFilters ? 'bg-primary/10 text-primary' : '',
        onClick: () => {
          showFilters = !showFilters
        },
      },
      {
        text: 'Refresh',
        iconComponent: RefreshIcon,
        style: 'ghost',
        color: 'neutral',
        disabled: loading,
        onClick: () => {
          void load(true, true)
        },
      },
    ]}
  >
    {#snippet left()}
      <Header
        text="Changelog"
        description="Changes to this record and its descendants · newest first"
        icon={HistoryIcon}
        size="sm"
        class="bits-form__section-header-heading w-auto! min-w-0"
      />
    {/snippet}
  </SectionHeader>
  {#if showFilters}
    <ChangelogFiltersBar
      {filters}
      options={filterOptions}
      onChange={value => {
        filters = value
      }}
    />
  {/if}
  {#if result}
    {#if result.unavailable.length}
      <p class="text-muted-foreground px-6 py-3 text-sm">
        Some revision sources are not enabled: {result.unavailable.join(', ')}.
      </p>
    {/if}
  {/if}
  {#if entries.length}
    <div class="relative min-h-0 w-full flex-1" data-changelog-list>
      {#key feedVersion}
        <VirtualList
          items={entries}
          getKey={entry => entry.key}
          height="100%"
          canResize={true}
          bufferBefore={8}
          bufferAfter={10}
          padding={0}
          applyBottomOverflow={false}
          onRangeChange={(_start, end) => {
            visibleEnd = end
          }}
        >
          {#snippet children(entry)}
            {#if checkBoundary?.position === 'before' &&
              checkBoundary.key === entry.key}
              {@render lastCheckedBar()}
            {/if}
            {@const boundary = timeBoundaries.get(entry.key)}
            {#if boundary}
              <h3
                data-changelog-boundary={boundary}
                class="border-border bg-primary/5 text-muted-foreground border-b px-4 py-2 text-xs font-medium"
              >
                {changelogTimeBoundaryLabel(boundary, locale)}
              </h3>
            {/if}
            <details
              class="group border-border w-full border-b"
              data-change-key={entry.key}
              open={expanded[entry.key] ?? false}
              ontoggle={event => {
                expanded[entry.key] = event.currentTarget.open
              }}
            >
              <summary
                class="hover:bg-muted/40 focus-visible:outline-ring grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 px-4 py-2 text-sm marker:content-none focus-visible:outline-2 focus-visible:-outline-offset-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.65fr)_auto]"
              >
                <span
                  class="text-muted-foreground pt-0.5 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                  >›</span
                >
                <span class="min-w-0 break-words whitespace-normal"
                  ><span class="text-muted-foreground mr-2 text-xs capitalize"
                    >{entry.resourceType}</span
                  ><span class="font-medium">{entry.name}</span></span
                >
                <span
                  class="text-muted-foreground col-start-2 min-w-0 text-xs break-words whitespace-normal sm:col-start-auto sm:text-sm"
                  >{operations(entry)}</span
                >
                <span
                  class="col-start-2 min-w-0 break-words whitespace-normal sm:col-start-auto"
                >
                  <ChangelogActor {entry} />
                </span>
                <time
                  class="text-muted-foreground col-start-3 row-start-1 text-xs whitespace-nowrap sm:col-start-auto sm:row-start-auto"
                  datetime={entry.createdAt}
                  title={timestamp(entry.createdAt)}
                  >{relative(entry.createdAt)}</time
                >
              </summary>
              {#if expanded[entry.key]}
                <div
                  class="border-border bg-muted/15 grid gap-3 border-t px-4 py-3 text-sm"
                >
                  <div
                    class="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                  >
                    <time datetime={entry.createdAt} title={timestamp(entry.createdAt)}
                      >{relative(entry.createdAt)}</time
                    >
                    <span aria-hidden="true">·</span>
                    <ChangelogActor {entry} />
                    <span class="min-w-0 font-mono break-words"
                      >{entry.baselineActor?.actorId ?? entry.actorId}</span
                    >
                  </div>
                  {#if entry.reason}
                    <p class="break-words whitespace-pre-wrap">{entry.reason}</p>
                  {/if}
                  {#if entry.baseline}
                    <p class="text-muted-foreground">
                      State captured when revision tracking began.
                      {#if entry.baselineActor}
                        Original {entry.baselineActor.role} attribution is retained;
                        snapshot recorded by {entry.actorId}.
                      {/if}
                    </p>
                  {/if}
                  {#if entry.redacted}
                    <p class="text-muted-foreground">
                      Some changes are hidden by current field permissions.
                    </p>
                  {/if}
                  {#each entry.changes as change}
                    <div class="border-border grid min-w-0 gap-2 border-t pt-2">
                      <p class="min-w-0 font-medium break-words">
                        {historyOperation(change, entry.category === 'fields').label}
                        <span class="text-muted-foreground font-normal"
                          >·
                          {entry.resourceType === 'feature'
                            ? featureReviewLabel(change.path)
                            : fieldLabel(change.path)}</span
                        >
                      </p>
                      <div class="grid min-w-0 gap-3 sm:grid-cols-2">
                        <div class="min-w-0">
                          <p class="text-muted-foreground mb-1 text-xs">Before</p>
                          <HistoryValue slot={change.before} />
                        </div>
                        <div class="min-w-0">
                          <p class="text-muted-foreground mb-1 text-xs">After</p>
                          <HistoryValue slot={change.after} />
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </details>
            {#if checkBoundary?.position === 'after' && checkBoundary.key === entry.key}
              {@render lastCheckedBar()}
            {/if}
          {/snippet}
        </VirtualList>
      {/key}
    </div>
  {:else if !loading && !failed && !nextCursor}
    {#if checkBoundary?.position === 'empty'}
      {@render lastCheckedBar()}
    {/if}
    <p class="text-muted-foreground px-6 py-6 text-sm">
      {filterCount ? 'No changes match these filters.' : 'No recorded changes yet.'}
    </p>
  {/if}
  {#if loading}
    <p class="text-muted-foreground shrink-0 px-6 py-3 text-sm" role="status">
      {entries.length ? 'Loading more changes…' : 'Loading changes…'}
    </p>
  {:else if failed}
    <div
      role="alert"
      class="flex shrink-0 flex-wrap items-center gap-3 px-6 py-3 text-sm"
    >
      <p>Changelog could not be loaded. Your access may have changed.</p>
      <button
        type="button"
        class="rounded-md border px-3 py-1.5"
        onclick={() => void load(!result)}
      >
        Retry
      </button>
    </div>
  {/if}
</section>
