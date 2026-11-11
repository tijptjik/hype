<script lang="ts">
// SVELTE
import { getContext, onMount, onDestroy, untrack } from 'svelte'
// CONTEXT
import { HEADER_CTRL_KEY, type HeaderCtrl } from '#lib/context/header.svelte.js'
// FILTERS
import HistoryFilters from './HistoryFilters.svelte'
import { resourceHistoryFilterEntry } from '#lib/revisions/historyFilters.js'
import { matchesChangelogFilters } from '#lib/revisions/changelogFilters.js'
import type { ChangelogEntry } from '#lib/revisions/changelog.js'
// SEARCH
import { matchesHistorySearch } from '#lib/revisions/historySearch.js'
// THIRD-PARTY
import { formatDistanceStrict } from 'date-fns'
// PRESENTATION
import { historyStyles as styles } from './organisationHistory.styles'
import { fieldLabel, groupChanges } from './presentation'
// COMPONENTS
import HistoryLocaleValues from './components/HistoryLocaleValues.svelte'
import { groupHistoryLocales } from '#lib/revisions/historyLocaleGroups.js'
import HistoryValue from './components/HistoryValue.svelte'
// BITS COMPONENTS
import HistoryActorIdentity from './components/HistoryActorIdentity.svelte'
import HistoryTimestamp from './components/HistoryTimestamp.svelte'
import { Button } from '#lib/bits/core/index.js'
import HistoryCategories from './HistoryCategories.svelte'
// ICONS
import RefreshIcon from 'virtual:icons/proicons/arrow-sync'
import ExpandIcon from 'virtual:icons/proicons/full-screen-maximize'
import CollapseIcon from 'virtual:icons/proicons/full-screen-minimize'
import ChevronIcon from 'virtual:icons/proicons/chevron-down'
import MetadataIcon from 'virtual:icons/proicons/database'
// BITS COMPONENTS
import HistorySkeleton from '#lib/bits/patterns/revisionHistory/HistorySkeleton.svelte'
// TYPES
import type { HistoryGroup } from './presentation'
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'

let {
  resourceId,
  resourceLabel,
  loadPage,
  showFields = false,
}: {
  resourceId: string
  resourceLabel:
    | ChangelogEntry['resourceType']
    | Capitalize<ChangelogEntry['resourceType']>
  loadPage: (
    before?: number,
    kind?: 'profile' | 'fields',
  ) => Promise<OrganisationHistoryPage>
  showFields?: boolean
} = $props()
let historyKind = $state<'profile' | 'fields'>('profile')
let entries = $state<OrganisationHistoryPage['entries']>([])
let available = $state(true)
let recordingEnabled = $state<boolean | undefined>()
let nextCursor = $state<number | null>(null)
let loading = $state(true)
let failed = $state(false)
let retryCursor = $state<number | undefined>()
let generation = 0
let expanded = $state<Record<string, boolean>>({})
let logoMetadataExpanded = $state<Record<string, boolean>>({})
const headerCtrl = getContext<HeaderCtrl | undefined>(HEADER_CTRL_KEY)
const searchQuery = $derived(headerCtrl?.historyQuery.trim() ?? '')
const filterEntries = $derived(
  entries.map(entry =>
    resourceHistoryFilterEntry(
      entry,
      resourceLabel.toLowerCase() as ChangelogEntry['resourceType'],
      historyKind,
    ),
  ),
)
const visibleEntries = $derived(
  new Set(
    entries
      .filter(
        (entry, index) =>
          matchesHistorySearch(searchQuery, entry) &&
          matchesChangelogFilters(
            filterEntries[index],
            headerCtrl?.historyFilters ?? {},
          ),
      )
      .map(entry => entry.id),
  ),
)
const hasFilters = $derived(
  !!searchQuery ||
    Object.values(headerCtrl?.historyFilters ?? {}).some(value => value !== undefined),
)
let now = $state(new Date())
const allExpanded = $derived(
  entries.filter(entry => !entry.initial).every(entry => expanded[entry.id]),
)

// Route-owned actions share the changelog toolbar while retaining local query ownership.
$effect(() => {
  headerCtrl?.setViewActions([
    {
      id: 'history-refresh',
      text: 'Refresh',
      icon: RefreshIcon,
      alwaysHideLabel: true,
      disabled: loading,
      onClick: () => {
        void load()
      },
    },
    {
      id: 'history-expand',
      text: allExpanded ? 'Collapse all' : 'Expand all',
      icon: allExpanded ? CollapseIcon : ExpandIcon,
      alwaysHideLabel: true,
      disabled: !entries.some(entry => !entry.initial),
      attrs: { 'aria-expanded': allExpanded },
      onClick: () => {
        expanded = Object.fromEntries(entries.map(entry => [entry.id, !allExpanded]))
      },
    },
  ])
})
onDestroy(() => headerCtrl?.setViewActions([]))

onMount(() => {
  now = new Date()
  const timer = setInterval(() => {
    now = new Date()
  }, 30_000)
  return () => clearInterval(timer)
})

/** Formats the age while the mounted viewer keeps its clock current.
 * @param value Recorded timestamp.
 * @returns Relative timestamp; exact time remains available on hover.
 */
function relative(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? formatDistanceStrict(date, now, { addSuffix: true })
    : 'Unknown time'
}

/** Describes the interval from the actual predecessor, including across page boundaries.
 * @param entry Recorded revision.
 * @returns Elapsed time, or no invented interval when evidence is unavailable.
 */
function interval(entry: OrganisationHistoryPage['entries'][number]): string | null {
  if (!entry.previousCreatedAt) return null
  const previous = new Date(entry.previousCreatedAt),
    current = new Date(entry.createdAt)
  if (
    !Number.isFinite(previous.getTime()) ||
    !Number.isFinite(current.getTime()) ||
    current < previous
  )
    return null
  return current.getTime() === previous.getTime()
    ? 'Recorded together'
    : `${formatDistanceStrict(previous, current)} since previous version`
}

/**
 * Loads fresh authorized history, ignoring responses after navigation or unmount.
 * @param before Optional continuation cursor.
 * @returns Completion of the current request.
 */
async function load(before?: number): Promise<void> {
  const request = ++generation
  loading = true
  failed = false
  retryCursor = before
  try {
    const result = await loadPage(before, historyKind)
    if (request !== generation) return
    entries = before ? [...entries, ...result.entries] : result.entries
    // Fresh history opens expanded, including when returning from the changelog.
    if (!before)
      expanded = Object.fromEntries(result.entries.map(entry => [entry.id, true]))
    available = result.available
    recordingEnabled = result.recordingEnabled
    nextCursor = result.nextCursor
  } catch {
    if (request === generation) {
      // A scope change may revoke access; do not retain previously visible evidence.
      entries = []
      nextCursor = null
      failed = true
      retryCursor = undefined
    }
  } finally {
    if (request === generation) loading = false
  }
}

/** Identifies logo references that belong beneath the visual comparison.
 * @param change Immutable field difference.
 * @returns Whether the path records a logo identity or exact image version.
 */
function isLogoChange(
  change: OrganisationHistoryPage['entries'][number]['changes'][number],
): boolean {
  return (
    (change.path[0] === 'record' &&
      change.path.length === 2 &&
      change.path[1] === 'imageId') ||
    (change.path[0] === 'logo' &&
      !['presentationMode', 'rotation'].includes(change.path[1]))
  )
}

/** Toggles a changeset from its surface without intercepting nested controls or text selection.
 * @param event Pointer click bubbling from the changeset.
 * @param entry Revision whose comparison can be expanded.
 * @returns Nothing; initial captures and independent interactive elements are unchanged.
 */
function toggleHistoryBlock(
  event: MouseEvent,
  entry: OrganisationHistoryPage['entries'][number],
): void {
  if (entry.initial || event.defaultPrevented) return
  if (
    event.target instanceof Element &&
    event.target.closest(
      'a, button, input, textarea, select, summary, [contenteditable="true"]',
    )
  )
    return
  if (window.getSelection()?.isCollapsed === false) return
  expanded[entry.id] = !expanded[entry.id]
}

$effect(() => {
  resourceId
  historyKind
  untrack(() => {
    entries = []
    nextCursor = null
    available = true
    recordingEnabled = undefined
    void load()
  })
  return () => {
    generation++
  }
})
</script>

<section
  class="@container w-full min-w-0 pb-12"
  aria-label={`${resourceLabel[0].toUpperCase()}${resourceLabel.slice(1)} history`}
  aria-busy={loading}
  data-history-surface
>
  <HistoryFilters
    entries={filterEntries}
    count={nextCursor === null ? visibleEntries.size : null}
    {loading}
    onChange={filters => {
      if (
        filters.category === 'profile' ||
        (showFields && filters.category === 'fields')
      )
        historyKind = filters.category
    }}
  />
  <HistoryCategories
    {showFields}
    {historyKind}
    {allExpanded}
    onSelect={kind => {
      historyKind = kind
      if (headerCtrl)
        headerCtrl.historyFilters = {
          ...headerCtrl.historyFilters,
          category: undefined,
        }
    }}
    onToggle={entries.some(entry => !entry.initial)
      ? collapsed => {
          expanded = Object.fromEntries(entries.map(entry => [entry.id, !collapsed]))
        }
      : undefined}
  />
  {#if !failed && available && recordingEnabled === false}
    <p class={styles.notice}>
      Showing stored history. New edits are not being recorded yet.
    </p>
  {/if}
  {#if failed}
    <div class={styles.notice} role="alert">
      <p>History could not be loaded. Your access may have changed.</p>
      <button
        type="button"
        class={styles.button}
        onclick={() => void load(retryCursor)}
      >
        Try again
      </button>
    </div>
  {:else if !available}
    <p class={styles.notice}>History tracking is not yet enabled.</p>
  {:else if !loading && entries.length === 0}
    <p class={styles.notice}>
      No recorded changes yet. Earlier edits are not available.
    </p>
  {/if}
  {#if hasFilters && !visibleEntries.size}
    <p role="status" class={styles.notice}>No matches in loaded history.</p>
  {/if}
  <ol hidden={entries.length === 0} class="px-3 py-5 @[36rem]:px-5">
    {#each entries as entry, index (entry.id)}
      <!-- Snapshots retain the logo on every save; show it only for a logo change or baseline. -->
      {@const hasLogo =
        !!entry.logo &&
        !!(entry.logo.before || entry.logo.after) &&
        (entry.initial || entry.changes.some(isLogoChange))}
      {@const groups = groupChanges(
        entry.changes.filter(change => !hasLogo || !isLogoChange(change)),
        entry.fieldLabels,
      )}
      {@const logoGroups = groupChanges(
        entry.changes.filter(change => hasLogo && isLogoChange(change)),
        entry.fieldLabels,
      )}
      {@const fields = [
        ...new Set(
          entry.changes.map(change =>
            change.path.length
              ? (entry.fieldLabels?.[change.path[0]] ??
                fieldLabel(change.path.slice(0, 1)))
              : 'Record',
          ),
        ),
      ]}
      {@const fieldSummary =
        fields.length > 2
          ? `${fields.slice(0, 2).join(', ')} +${fields.length - 2} more`
          : fields.join(', ') || '—'}
      <li
        hidden={!visibleEntries.has(entry.id)}
        class="relative min-w-0 pb-5 pl-5 last:pb-0 @[36rem]:pl-7"
      >
        <!-- Connect revision markers through comparisons and elapsed-time rows. -->
        {#if index < entries.length - 1 || nextCursor !== null}
          <span
            aria-hidden="true"
            class="border-primary/25 pointer-events-none absolute top-6 left-[3.5px] border-l"
            style:bottom={index < entries.length - 1 ? '-1.5rem' : '0'}
          ></span>
        {/if}
        <span
          aria-hidden="true"
          class={`absolute top-6 left-0 z-10 size-[9px] rounded-full ${index === 0 ? 'bg-primary' : 'border-primary/50 border-2 bg-[var(--form-workspace,var(--color-panel))]'}`}
        ></span>
        <!-- The disclosure button provides keyboard access; the surface adds pointer convenience. -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <!-- biome-ignore lint/a11y/useKeyWithClickEvents: The sibling disclosure button supplies keyboard access; links and tree controls retain their own semantics. -->
        <article
          class={styles.entry}
          class:cursor-pointer={!entry.initial}
          onclick={event => toggleHistoryBlock(event, entry)}
        >
          <!-- Keep profile navigation independent of the comparison disclosure. -->
          <header class={styles.resourceSummary}>
            <div class="col-span-full min-w-0 @[64rem]:col-span-1">
              <div class="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span class="text-muted-foreground">
                  {entry.initial ? 'Baseline' : 'Revision'}
                </span>
                {#if index === 0}
                  <span class="text-primary font-medium">Latest</span>
                {/if}
              </div>
              <h3
                class="text-foreground text-sm leading-relaxed font-medium break-words"
              >
                {entry.reason ===
                'Verified exact logo baseline; earlier logo versions are not reconstructed'
                  ? 'Verified baseline'
                  : (entry.reason ??
                    (entry.initial
                      ? 'Initial recorded state'
                      : 'Profile and settings updated'))}
              </h3>
            </div>
            <dl class={styles.metadata}>
              <div class="max-w-[min(100%,480px)] min-w-0 space-y-1">
                <dt class={styles.label}>Field</dt>
                <dd
                  class="text-foreground text-sm break-words whitespace-normal"
                  data-tooltip={fields.length > 2 ? fields.join(', ') : undefined}
                >
                  {fieldSummary}
                </dd>
              </div>
              <div class="min-w-0 space-y-1">
                <dt class={styles.label}>Changed</dt>
                <dd>
                  <HistoryTimestamp
                    class="text-foreground text-sm"
                    value={entry.createdAt}
                    exact={new Date(entry.createdAt).toLocaleString()}
                    label={relative(entry.createdAt)}
                  />
                </dd>
              </div>
              <div class="max-w-full min-w-0 space-y-1">
                <dt class={styles.label}>Actor</dt>
                <dd class="min-w-0">
                  {#if entry.origin === 'user' && entry.actor}
                    {@const actor = entry.actor}
                    <HistoryActorIdentity
                      username={actor.username}
                      label={actor.username
                        ? `@${actor.displayUsername || actor.username}`
                        : actor.name || 'User unavailable'}
                      image={actor.image}
                      avatarName={actor.name || actor.username || ''}
                      showAvatar
                      class="text-foreground text-sm"
                    />
                  {:else}
                    <span
                      class="text-muted-foreground text-sm"
                      data-tooltip={entry.actorId}
                    >
                      {entry.origin === 'migration'
                        ? 'Author unknown'
                        : entry.origin === 'system'
                          ? 'System'
                          : 'User unavailable'}
                    </span>
                  {/if}
                </dd>
              </div>
              <div class="min-w-0 space-y-1">
                <dt class={styles.label}>Source</dt>
                <dd class="text-foreground text-sm break-words capitalize">
                  {entry.origin}
                </dd>
              </div>
            </dl>
            {#if !entry.initial}
              <button
                type="button"
                class="{styles.disclosure} col-span-full @[64rem]:col-span-1"
                aria-expanded={!!searchQuery || !!expanded[entry.id]}
                aria-controls={`changes-${entry.id}`}
                onclick={() => {
                  expanded[entry.id] = !expanded[entry.id]
                }}
              >
                <span class="text-xs tabular-nums">
                  {groupHistoryLocales(entry.changes).length}
                  changed
                  {groupHistoryLocales(entry.changes).length === 1 ? 'field' : 'fields'}
                </span>
                <ChevronIcon
                  aria-hidden="true"
                  class={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${searchQuery || expanded[entry.id] ? '' : '-rotate-90'}`}
                />
              </button>
            {/if}
          </header>
          {#snippet fieldComparison(field: HistoryGroup['fields'][number])}
            <section
              class={styles.comparison}
              aria-label={field.label ?? field.operation}
            >
              <dl class={styles.fieldHeading}>
                {#if field.label}
                  <div class="min-w-0 space-y-1">
                    <dt class={styles.label}>Field</dt>
                    <dd
                      class="text-sm font-medium break-words"
                      title={field.change.path.join(' › ')}
                    >
                      {field.label}
                    </dd>
                  </div>
                {/if}
                <div class="col-start-2 min-w-0 space-y-1">
                  <dt class={styles.label}>Action</dt>
                  <dd class="text-sm font-medium">{field.operation}</dd>
                </div>
              </dl>
              {#if field.rows[0].locale !== null}
                <HistoryLocaleValues rows={field.rows}>
                  {#snippet value(row, side)}
                    <HistoryValue {...{ slot: row[side] }} path={row.path} />
                  {/snippet}
                </HistoryLocaleValues>
              {:else}
                <dl class={styles.values}>
                  <div class={styles.before}>
                    <dt class={styles.label}>Before</dt>
                    <dd class="min-w-0">
                      <HistoryValue
                        slot={field.change.before}
                        path={field.change.path}
                      />
                    </dd>
                  </div>
                  <div class={styles.after}>
                    <dt class={styles.label}>After</dt>
                    <dd class="min-w-0">
                      <HistoryValue
                        slot={field.change.after}
                        path={field.change.path}
                      />
                    </dd>
                  </div>
                </dl>
              {/if}
            </section>
          {/snippet}
          {#snippet logoComparison()}
            {#if hasLogo && entry.logo}
              <section class={styles.comparison} aria-label="Logo history">
                <div
                  class="border-border/50 bg-muted/30 flex min-w-0 items-center justify-between gap-3 border-b px-4 py-2"
                >
                  <h4 class="text-sm font-medium">Logo</h4>
                  {#if logoGroups.length}
                    <Button
                      text="Metadata"
                      iconComponent={MetadataIcon}
                      iconClasses="size-4! [&_svg]:size-4!"
                      hideLabel
                      hideLabelInstantly
                      style="ghost"
                      color="neutral"
                      class="size-8! shrink-0 p-0!"
                      attrs={{
                        'aria-expanded': !!logoMetadataExpanded[entry.id],
                        'aria-pressed': !!logoMetadataExpanded[entry.id],
                        'aria-controls': `logo-metadata-${entry.id}`,
                      }}
                      onClick={() => {
                        logoMetadataExpanded[entry.id] = !logoMetadataExpanded[entry.id]
                      }}
                    />
                  {/if}
                </div>
                <dl class={entry.initial ? 'min-w-0' : styles.values}>
                  {#each entry.initial
                    ? [{ label: 'After', logo: entry.logo.after }]
                    : [
                        { label: 'Before', logo: entry.logo.before },
                        { label: 'After', logo: entry.logo.after },
                      ] as item}
                    <div class={item.label === 'Before' ? styles.before : styles.after}>
                      <dt class={styles.label}>{item.label}</dt>
                      <dd class="min-w-0">
                        {#if item.logo?.imageRevisionId}
                          <img
                            src={`/api/images/revisions/${encodeURIComponent(item.logo.imageRevisionId)}?t=c_fit,w_160,h_160`}
                            alt={`${item.label} logo`}
                            class="border-border/50 size-20 rounded-md border object-contain"
                            loading="lazy"
                          >
                        {:else}
                          <p class="text-muted-foreground text-sm">
                            {item.logo
                              ? 'Exact historical version unavailable'
                              : 'No logo'}
                          </p>
                        {/if}
                      </dd>
                    </div>
                  {/each}
                </dl>
                {#if logoGroups.length}
                  <div
                    id={`logo-metadata-${entry.id}`}
                    hidden={!logoMetadataExpanded[entry.id]}
                  >
                    <section
                      class="border-border/40 grid min-w-0 gap-3 border-t p-4"
                      aria-label="Image references"
                    >
                      {#each logoGroups as group (group.key)}
                        {#each group.fields as field}
                          {@render fieldComparison(field)}
                        {/each}
                      {/each}
                    </section>
                  </div>
                {/if}
              </section>
            {/if}
          {/snippet}
          {#if entry.initial}
            <div class="border-border/50 grid gap-3 border-t p-4">
              <p class="text-muted-foreground text-xs">
                No earlier comparison is available.
              </p>
              {@render logoComparison()}
            </div>
          {:else}
            <div
              id={`changes-${entry.id}`}
              hidden={!searchQuery && !expanded[entry.id]}
            >
              <div class="border-border/50 bg-muted/10 grid min-w-0 gap-5 border-t p-4">
                {@render logoComparison()}
                {#each groups as group (group.key)}
                  <section class={styles.group} aria-label={group.label}>
                    <h4
                      class="text-foreground flex min-w-0 items-center gap-2 text-sm font-medium break-words"
                    >
                      <span
                        class="bg-primary/50 h-3 w-0.5 shrink-0 rounded-full"
                        aria-hidden="true"
                      ></span>
                      {group.label}
                      <span
                        class="text-muted-foreground text-xs font-normal tabular-nums"
                        >{group.fields.length}</span
                      >
                    </h4>
                    {#each group.fields as field}
                      {@render fieldComparison(field)}
                    {/each}
                  </section>
                {/each}
              </div>
            </div>
          {/if}
          {#if !entry.initial && interval(entry)}
            <p
              class="border-border/40 text-muted-foreground border-t px-4 py-2 text-xs"
            >
              {interval(entry)}
            </p>
          {/if}
        </article>
      </li>
    {/each}
  </ol>
  {#if loading}
    <HistorySkeleton
      heading={false}
      expanded={entries.length === 0}
      count={entries.length ? 1 : 3}
    />
  {/if}
  {#if nextCursor !== null && !failed}
    <div class="px-6 py-3">
      <button
        type="button"
        class={styles.button}
        disabled={loading}
        onclick={() => void load(nextCursor ?? undefined)}
      >
        Older changes
      </button>
    </div>
  {/if}
  {#if entries.length}
    <p class="border-border/40 text-muted-foreground mx-6 border-t pt-4 text-xs">
      Read-only history · Staff role assignments are not included.
    </p>
  {/if}
</section>
