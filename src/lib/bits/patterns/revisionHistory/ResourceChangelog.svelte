<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// COMPONENTS
import ChangelogValue from './components/ChangelogValue.svelte'
import HistoryTimestamp from './components/HistoryTimestamp.svelte'
import ChangelogEntryHeader from './components/ChangelogEntryHeader.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import ChangelogFiltersBar from './components/ChangelogFilters.svelte'
import ChangelogActor from './components/ChangelogActor.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import Header from '#lib/bits/custom/header/Header.svelte'
import { VirtualList } from '#lib/bits/custom/index/src/index.js'
// ICONS
import MetadataIcon from 'virtual:icons/proicons/database'
import HistoryIcon from 'virtual:icons/proicons/history'
import ChevronRightIcon from 'virtual:icons/proicons/chevron-right'
import FilterIcon from 'virtual:icons/proicons/filter'
import ExpandIcon from 'virtual:icons/proicons/full-screen-maximize'
import CollapseIcon from 'virtual:icons/proicons/full-screen-minimize'
import RefreshIcon from 'virtual:icons/proicons/arrow-sync'
// PRESENTATION
import HistoryLocaleValues from './components/HistoryLocaleValues.svelte'
import { groupHistoryLocales, localeGroupAction } from '#lib/revisions/historyLocaleGroups.js'
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
  description = 'Changes to this record and its descendants · newest first',
  locale,
  loadPage,
  onLoaded,
  lastCheckedAt = null,
  filters = $bindable<ChangelogFilters>({}),
}: {
  identity: string
  description?: string
  locale: string
  loadPage: (
    before?: ChangelogCursor,
    filters?: ChangelogFilters,
    includeFilterOptions?: boolean,
  ) => Promise<ChangelogPage>
  onLoaded?: (page: ChangelogPage) => void
  lastCheckedAt?: string | null
  filters?: ChangelogFilters
} = $props()
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
let imageMetadata = $state<Record<string, boolean>>({})
const metadataPrefix = $props.id()
let expandByDefault = $state(false)
const allCollapsed = $derived(
  !entries.some(entry => expanded[entry.key] ?? expandByDefault),
)
let generation = 0
let now = $state(new Date())
// Fixed disclosure/date tracks keep every virtual row aligned with the column headings.
const columnClasses =
  'grid grid-cols-[1rem_minmax(0,1fr)_5.5rem] gap-x-2 px-4 @[48rem]:grid-cols-[1rem_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_9rem]'
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
    imageMetadata = {}
    expandByDefault = false
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

/** Apply pointer and keyboard activation before native deferred toggle events can race row recycling.
 * @param event Click activation dispatched by the summary, including Enter and Space.
 * @param key Immutable changelog entry identity.
 * @returns Nothing; the retained state drives both the native open attribute and body.
 * @remarks Actor links stop propagation and retain their own navigation behavior.
 */
function toggleEntry(event: MouseEvent, key: string): void {
  if (event.defaultPrevented) return
  event.preventDefault()
  expanded[key] = !(expanded[key] ?? expandByDefault)
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

/** Label a changed field using its historical property key instead of its opaque ID.
 * @param entry Authorized changelog entry with retained property metadata.
 * @param path Immutable field path, including the property identity for catalogue changes.
 * @returns Readable field path with the property key preserved verbatim.
 */
function changeFieldLabel(entry: ChangelogEntry, path: readonly string[]): string {
  if (entry.resourceType === 'feature') return featureReviewLabel(path)
  if (entry.resourceType === 'property') {
    const key = entry.propertyKey ?? entry.name
    return path.length > 1 ? `${key} / ${fieldLabel(path.slice(1))}` : key
  }
  return fieldLabel(path)
}

/** Summarize distinct top-level fields without hiding additional changes.
 * @param entry Authorized changelog entry.
 * @returns Compact visible label and complete field list for the tooltip.
 */
function entryFields(entry: ChangelogEntry): { label: string; full: string } {
  const fields = [
    ...new Set(
      entry.changes.map(change =>
        change.path.length
          ? entry.resourceType === 'property'
            ? changeFieldLabel(entry, change.path.slice(0, 1))
            : fieldLabel(change.path.slice(0, 1))
          : 'Record',
      ),
    ),
  ]
  const full = fields.join(', ') || '—'
  return {
    label:
      fields.length > 2
        ? `${fields.slice(0, 2).join(', ')} +${fields.length - 2} more`
        : full,
    full,
  }
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

{#snippet loadingRows(count: number, label: string)}
  <div role="status" aria-label={label} data-changelog-skeletons>
    <span class="sr-only">{label}</span>
    {#each Array(count) as _, index (index)}
      <div
        class="{columnClasses} border-border items-start gap-y-2 border-b py-2"
        aria-hidden="true"
        data-changelog-skeleton-row
      >
        <Skeleton class="mt-1 size-3" />
        <div class="flex min-w-0 flex-col gap-2 py-1">
          <div class="flex min-w-0 items-center gap-2">
            <Skeleton class="h-3 w-12 shrink-0" />
            <Skeleton class="h-3 w-3/5 max-w-72 min-w-0" />
          </div>
          <Skeleton class="h-3 w-4/5 @[48rem]:hidden" />
        </div>
        <Skeleton
          class="col-start-2 my-1 h-3 w-20 max-w-full @[48rem]:col-start-auto"
        />
        <Skeleton
          class="col-start-2 my-1 h-3 w-24 max-w-full @[48rem]:col-start-auto"
        />
        <Skeleton
          class="col-start-2 my-1 h-3 w-28 max-w-full @[48rem]:col-start-auto"
        />
        <Skeleton
          class="col-start-3 row-start-1 my-1 h-3 w-16 max-w-full justify-self-end @[48rem]:col-start-auto @[48rem]:row-start-auto"
        />
      </div>
    {/each}
  </div>
{/snippet}

{#snippet lastCheckedBar()}
  {#if lastCheckedAt}
    <!-- biome-ignore lint/a11y/useSemanticElements: This labeled separator contains a visible timestamp, which an hr cannot contain. -->
    <div
      data-last-checked
      role="separator"
      aria-label={`Last checked ${timestamp(lastCheckedAt)}`}
      data-tooltip={timestamp(lastCheckedAt)}
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
  class="@container flex h-full min-h-0 w-full min-w-0 flex-col"
  aria-label="Changelog"
  aria-busy={loading || pendingFilters}
>
  <SectionHeader
    class="[&>div:last-child]:[container-type:normal] [&>div:last-child]:items-center"
    actions={[
      {
        text: filterCount ? `Filters (${filterCount})` : 'Filters',
        iconComponent: FilterIcon,
        iconClasses: 'size-5! [&_svg]:size-5!',
        hideLabel: true,
        hideLabelInstantly: true,
        style: 'ghost',
        color: 'neutral',
        attrs: {
          'aria-expanded': showFilters,
          'aria-pressed': showFilters,
          'aria-label': filterCount ? `Filters, ${filterCount} active` : 'Filters',
        },
        class: `size-11! shrink-0 p-0! ${filterCount || showFilters ? 'bg-primary/10 text-primary' : ''}`,
        onClick: () => {
          showFilters = !showFilters
        },
      },
      {
        text: 'Refresh',
        iconComponent: RefreshIcon,
        class: 'size-11! shrink-0 p-0!',
        iconClasses: 'size-5! [&_svg]:size-5!',
        hideLabel: true,
        hideLabelInstantly: true,
        style: 'ghost',
        color: 'neutral',
        disabled: loading,
        onClick: () => {
          void load(true, true)
        },
      },
      {
        text: allCollapsed ? 'Expand all' : 'Collapse all',
        iconComponent: allCollapsed ? ExpandIcon : CollapseIcon,
        iconClasses: 'size-5! [&_svg]:size-5!',
        class: 'size-11! shrink-0 p-0!',
        hideLabel: true,
        hideLabelInstantly: true,
        style: 'ghost',
        color: 'neutral',
        attrs: { 'aria-expanded': !allCollapsed },
        onClick: () => {
          expandByDefault = allCollapsed
          expanded = Object.fromEntries(
            entries.map(entry => [entry.key, expandByDefault]),
          )
        },
      },
    ]}
  >
    {#snippet left()}
      <Header
        text="Changelog"
        {description}
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
      count={!loading && !pendingFilters && !nextCursor ? entries.length : null}
      countLoading={loading || pendingFilters}
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
  <div
    data-changelog-columns
    class="{columnClasses} border-primary/25 bg-[color-mix(in_oklab,var(--color-primary)_18%,var(--color-panel))] text-foreground shrink-0 items-center border-b py-2 text-xs font-semibold"
  >
    <span aria-hidden="true"></span>
    <span data-changelog-column="resource">
      <span class="@[48rem]:hidden">Resource · Field · Action · Actor</span>
      <span class="hidden @[48rem]:inline">Resource</span>
    </span>
    <span data-changelog-column="field" class="hidden @[48rem]:block">Field</span>
    <span data-changelog-column="action" class="hidden @[48rem]:block">Action</span>
    <span data-changelog-column="actor" class="hidden @[48rem]:block">Actor</span>
    <span data-changelog-column="changed" class="text-right">Changed</span>
  </div>
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
            {@const fields = entryFields(entry)}
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
            <!-- The native summary provides keyboard activation; content clicks offer the same collapse action. -->
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
            <!-- biome-ignore lint/a11y/useKeyWithClickEvents: The native summary supplies keyboard activation. -->
            <details
              class="group border-border w-full border-b"
              data-change-key={entry.key}
              open={expanded[entry.key] ?? expandByDefault}
            >
              <!-- biome-ignore lint/a11y/noStaticElementInteractions: Native summary is the keyboard-operable disclosure control. -->
              <summary
                onclick={event => toggleEntry(event, entry.key)}
                class="{columnClasses} hover:bg-muted/40 focus-visible:outline-ring cursor-pointer select-none items-start gap-y-1 py-2 text-sm marker:content-none focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <span
                  data-changelog-chevron
                  class="text-muted-foreground mt-0.5 inline-flex size-4 items-center justify-center"
                  aria-hidden="true"
                >
                  <ChevronRightIcon
                    class="size-3 origin-center transition-transform duration-200 motion-reduce:transition-none {(expanded[
                      entry.key
                    ] ?? expandByDefault)
                      ? 'rotate-90'
                      : ''}"
                  />
                </span>
                <span
                  data-changelog-cell="resource"
                  class="min-w-0 break-words whitespace-normal"
                  ><span class="text-muted-foreground mr-2 text-xs capitalize"
                    >{entry.resourceType}</span
                  ><span class="font-medium">{entry.name}</span></span
                >
                <span
                  data-changelog-cell="field"
                  data-tooltip={fields.full}
                  class="text-muted-foreground col-start-2 min-w-0 text-xs break-words whitespace-normal @[48rem]:col-start-auto @[48rem]:text-sm"
                  >{fields.label}</span
                >
                <span
                  data-changelog-cell="action"
                  class="text-muted-foreground col-start-2 min-w-0 text-xs break-words whitespace-normal @[48rem]:col-start-auto @[48rem]:text-sm"
                  >{operations(entry)}</span
                >
                <span
                  data-changelog-cell="actor"
                  class="col-start-2 min-w-0 break-words whitespace-normal @[48rem]:col-start-auto"
                >
                  <ChangelogActor {entry} />
                </span>
                <HistoryTimestamp
                  data-changelog-cell="changed"
                  class="text-muted-foreground col-start-3 row-start-1 min-w-0 text-right text-xs break-words whitespace-normal @[48rem]:col-start-auto @[48rem]:row-start-auto"
                  value={entry.createdAt}
                  exact={timestamp(entry.createdAt)}
                  label={relative(entry.createdAt)}
                />
              </summary>
              {#if expanded[entry.key] ?? expandByDefault}
                <div class="border-border bg-muted/15 border-t text-sm">
                  <div
                    class="border-border bg-primary/5 px-8 py-4 {entry.changes.length ||
                    entry.redacted
                      ? 'border-b'
                      : ''}"
                  >
                    <ChangelogEntryHeader
                      {entry}
                      relativeTime={relative(entry.createdAt)}
                      exactTime={timestamp(entry.createdAt)}
                    />
                  </div>
                  {#if entry.changes.length || entry.redacted}
                    <div class="grid min-w-0 gap-4 px-8 py-4">
                      {#if entry.redacted}
                        <p class="text-muted-foreground">
                          Some changes are hidden by current field permissions.
                        </p>
                      {/if}
                      {#each groupHistoryLocales(entry.changes) as group}
                        {@const change = group.rows[0].change}
                        {@const metadataKey = JSON.stringify([entry.key, change.path])}
                        {@const metadataId =
                          metadataPrefix + encodeURIComponent(metadataKey)}
                        {@const hasImage =
                          ['imageId', 'imageRevisionId'].includes(
                            change.path.at(-1) ?? '',
                          ) ||
                          [change.before, change.after].some(
                            slot =>
                              slot.present &&
                              slot.value &&
                              typeof slot.value === 'object' &&
                              !Array.isArray(slot.value) &&
                              typeof slot.value.imageId === 'string',
                          )}
                        <section
                          class="border-border bg-panel min-w-0 overflow-hidden rounded-md border"
                          aria-label={changeFieldLabel(entry, group.path)}
                        >
                          <div class="relative">
                            <dl
                              class="border-border bg-muted/30 flex min-w-0 flex-wrap gap-y-2 border-b px-4 py-3 pr-14"
                              style:column-gap="48px"
                              data-changelog-change-heading
                            >
                              <div
                                class="max-w-[min(100%,480px)] min-w-0 flex-none space-y-1"
                              >
                                <dt class="text-muted-foreground text-xs font-medium">
                                  Field
                                </dt>
                                <dd
                                  class="min-w-0 font-medium break-words"
                                  data-tooltip={entry.resourceType === 'property'
                                    ? entry.resourceId
                                    : undefined}
                                >
                                  {changeFieldLabel(entry, group.path)}
                                </dd>
                              </div>
                              <div
                                class="max-w-[min(100%,480px)] min-w-0 flex-none space-y-1"
                              >
                                <dt class="text-muted-foreground text-xs font-medium">
                                  Action
                                </dt>
                                <dd class="font-medium break-words">
                                  {group.rows[0].locale !== null ? localeGroupAction(group) : historyOperation(change, entry.category === 'fields').label}
                                </dd>
                              </div>
                            </dl>
                            {#if hasImage}
                              <Button
                                text="Image metadata"
                                iconComponent={MetadataIcon}
                                iconClasses="size-4! [&_svg]:size-4!"
                                hideLabel
                                hideLabelInstantly
                                style="ghost"
                                color="neutral"
                                class="absolute top-3 right-3 size-9! p-0!"
                                attrs={{
                                  'aria-expanded': imageMetadata[metadataKey] ?? false,
                                  'aria-pressed': imageMetadata[metadataKey] ?? false,
                                  'aria-controls': metadataId,
                                }}
                                onClick={() => {
                                  imageMetadata[metadataKey] =
                                    !imageMetadata[metadataKey]
                                }}
                              />
                            {/if}
                          </div>
                          {#if group.rows[0].locale !== null}
                            <HistoryLocaleValues rows={group.rows}>
                              {#snippet value(row, side)}<ChangelogValue {entry} change={row} {side} />{/snippet}
                            </HistoryLocaleValues>
                          {:else}
                            <div
                              id={metadataId}
                              class="grid min-w-0 items-start gap-4 p-4 @[36rem]:grid-cols-2"
                            >
                              <div class="min-w-0">
                                <p class="text-muted-foreground mb-1 text-xs">Before</p>
                                <ChangelogValue
                                  {entry}
                                  {change}
                                  side="before"
                                  metadataOpen={imageMetadata[metadataKey] ?? false}
                                />
                              </div>
                              <div class="min-w-0">
                                <p class="text-muted-foreground mb-1 text-xs">After</p>
                                <ChangelogValue
                                  {entry}
                                  {change}
                                  side="after"
                                  metadataOpen={imageMetadata[metadataKey] ?? false}
                                />
                              </div>
                            </div>
                          {/if}
                        </section>
                      {/each}
                    </div>
                  {/if}
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
  {:else if loading}
    <div class="min-h-0 flex-1 overflow-hidden">
      {@render loadingRows(8, 'Loading changes')}
    </div>
  {:else if !loading && !failed && !nextCursor}
    {#if checkBoundary?.position === 'empty'}
      {@render lastCheckedBar()}
    {/if}
    <p class="text-muted-foreground px-6 py-6 text-sm">
      {filterCount ? 'No changes match these filters.' : 'No recorded changes yet.'}
    </p>
  {/if}
  {#if loading && entries.length}
    <div class="shrink-0" data-changelog-continuation-loading>
      {@render loadingRows(1, 'Loading more changes')}
    </div>
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
