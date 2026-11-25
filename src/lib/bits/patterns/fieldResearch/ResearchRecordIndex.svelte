<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { toast } from 'svelte-sonner'
// I18N
import { getLocale } from '#lib/i18n.js'
// DOMAIN
import { getFeatureIdenticonUrl } from '#lib/utils/identicon.js'
import { recorderPhotoThumbnailTransform } from '#lib/fieldResearch/recorderPhotos.js'
// BITS COMPONENTS
import { cx } from '#lib/bits/utils.js'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import { getRowRootClass } from '#lib/bits/custom/rows/row.styles.js'
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'
import Select from '#lib/bits/core/select/Select.svelte'
import ResourceBulkEditControl from '#lib/bits/patterns/resource/resourceControlBar/ResourceBulkEditControl.svelte'
import ResultCount from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarResultCount.svelte'
import FilterReset from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarFilterReset.svelte'
// TYPES
import type { ResourceBulkEditConfig } from '#lib/client/services/bulkEdit.types.js'
// ICONS
import RecordsIcon from 'virtual:icons/lucide/list'
// API
import {
  getResearchRecords,
  getMatchingResearchRecordIds,
  updateResearchRecords,
} from '#lib/api/fieldResearch.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'

let {
  sessionId,
  isSuperAdmin,
  readOnly,
}: { sessionId: string; isSuperAdmin: boolean; readOnly: boolean } = $props()
type Setting = 'interior' | 'exterior' | 'unspecified'
type Action = 'archive' | 'restore' | 'delete'
let setting = $state<Setting | undefined>()
let search = $state('')
let archived = $state(false)
let bulk = $state(false)
let bulkOpen = $state(false)
let selecting = $state(false)
let applying = $state(false)
let selected = $state(new Set<string>())
let action = $state<Action>('archive')
let total = $state(0)
let generation = 0
let selectionVersion = 0
const options = $derived({
  sessionId,
  setting,
  search: search.trim() || undefined,
  archived: archived && isSuperAdmin,
})
const actions = $derived([
  options.archived
    ? { value: 'restore', label: 'Restore' }
    : { value: 'archive', label: 'Archive' },
  ...(isSuperAdmin ? [{ value: 'delete', label: 'Delete' }] : []),
])
let records = $state<Awaited<ReturnType<typeof getResearchRecords>>['records']>([])
let next = $state<number | null>(null)
let ready = $state(false)
let loading = $state(false)
let failure = $state('')
const dateFormat = $derived(
  new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }),
)
const columns =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-x-4 px-4 sm:grid-cols-[minmax(0,1fr)_6rem_12rem]'

/** Fetch the next page for this mounted session, preserving earlier rows on retry.
 * @returns Once the page or its error has been displayed.
 */
async function load(): Promise<void> {
  const version = generation
  if (loading || (ready && next === null)) return
  loading = true
  failure = ''
  try {
    const result = await refreshRemoteQuery(
      getResearchRecords({ ...options, before: next ?? undefined }),
    )
    if (version !== generation) return
    if (!ready) total = result.records[0]?.total ?? 0
    records = [...records, ...result.records]
    next = result.next
    ready = true
  } catch (error) {
    if (version === generation)
      failure = error instanceof Error ? error.message : String(error)
  } finally {
    if (version === generation) loading = false
  }
}
/** Clear selection when its scope or the open action menu changes. */
function setBulk(active: boolean): void {
  selectionVersion++
  bulk = active
  selecting = false
  selected = new Set()
  action = options.archived ? 'restore' : 'archive'
}

/** Start a fresh list, discarding responses from older filters. */
function reload(): void {
  generation++
  setBulk(false)
  ready = false
  loading = false
  total = 0
  next = null
  records = []
  void load()
}

$effect(() => {
  options
  untrack(reload)
  return () => {
    generation++
    selectionVersion++
  }
})

/** Select or invert matching receipts across all pages without navigating the list. */
async function selectMatches(invert: boolean): Promise<void> {
  if (selecting || applying) return
  const version = selectionVersion
  selecting = true
  try {
    const ids = await refreshRemoteQuery(getMatchingResearchRecordIds(options))
    if (version === selectionVersion)
      selected = new Set(invert ? ids.filter(id => !selected.has(id)) : ids)
  } catch (error) {
    if (version === selectionVersion)
      toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    if (version === selectionVersion) selecting = false
  }
}

/** Toggle one record without following its linked Feature. */
function toggleRecord(record: { id: string }): void {
  if (selecting || applying) return
  const updated = new Set(selected)
  if (updated.has(record.id)) updated.delete(record.id)
  else updated.add(record.id)
  selected = updated
}

/** Apply the selected action once and refresh the current filtered page. */
async function apply(): Promise<void> {
  if (!selected.size || applying || selecting || readOnly) return
  const ids = [...selected]
  if (
    action === 'delete' &&
    !window.confirm(
      `Permanently delete ${ids.length} selected session ${ids.length === 1 ? 'record' : 'records'}? Linked Features will be kept.`,
    )
  )
    return
  applying = true
  const version = generation
  try {
    const result = await updateResearchRecords({
      sessionId,
      ids,
      archived: options.archived,
      action,
    })
    const past = { archive: 'archived', restore: 'restored', delete: 'deleted' }[action]
    toast.success(
      `${result.count} ${result.count === 1 ? 'record' : 'records'} ${past}.`,
    )
    if (version === generation) reload()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    applying = false
  }
}

const bulkConfig: ResourceBulkEditConfig = $derived({
  isActive: bulk,
  selectedCount: selected.size,
  options: actions,
  selectedOptionValue: action,
  progress: applying
    ? { completed: 0, total: selected.size, errors: 0, isApplying: true }
    : null,
  applyDisabled: !selected.size || applying || selecting,
  isSelectingAll: selecting,
  onSelectAll: () => selectMatches(false),
  onToggleMode: () => setBulk(!bulk),
  onInvertSelection: () => void selectMatches(true),
  onOptionChange: value => {
    if (value === 'archive' || value === 'restore' || value === 'delete') action = value
  },
  onApply: apply,
})
</script>

<section aria-label="Records" class="flex min-h-0 min-w-0 flex-1 flex-col">
  <SectionHeader title="Records" icon={RecordsIcon} />
  <fieldset
    aria-label="Record filters and bulk actions"
    class="bits-theme bg-base-200 flex flex-wrap items-center gap-3 px-4 py-3"
  >
    {#if !bulkOpen}
      <input
        type="search"
        aria-label="Search records"
        placeholder="Search records"
        maxlength="200"
        bind:value={search}
        class="border-border bg-panel text-foreground h-9 w-48 max-w-full rounded-lg border px-3 text-sm"
      >
      <Select
        placeholder="Setting"
        value={setting ?? 'all'}
        items={[
          { value: 'all', label: 'All settings' },
          { value: 'interior', label: 'Interior' },
          { value: 'exterior', label: 'Exterior' },
          { value: 'unspecified', label: 'Unspecified setting' },
        ]}
        triggerClass="h-9 w-max text-sm"
        onValueChange={value =>
          (setting = value === 'all' ? undefined : (value as Setting))}
      />
      {#if isSuperAdmin}
        <Select
          placeholder="Archive status"
          value={archived ? 'archived' : 'active'}
          items={[
            { value: 'active', label: 'Active records' },
            { value: 'archived', label: 'Archived records' },
          ]}
          triggerClass="h-9 w-max text-sm"
          onValueChange={value => (archived = value === 'archived')}
        />
      {/if}
    {/if}
    {#if !readOnly}
      <div class={bulkOpen ? 'min-w-0 flex-1 overflow-x-auto' : 'sm:ml-auto'}>
        <ResourceBulkEditControl config={bulkConfig} bind:isOpen={bulkOpen} />
      </div>
    {/if}
    {#if !bulkOpen}
      <ResultCount count={total} countLoading={!ready && !failure} />
      <FilterReset
        disabled={!search && !setting && !archived}
        onClick={() => {
          search = ''
          setting = undefined
          archived = false
        }}
      />
    {/if}
  </fieldset>
  {#if failure}
    <p role="alert" class="text-error mx-5 my-3">
      {failure}
      <button type="button" class="ml-2 underline" onclick={load}>Retry</button>
    </p>
  {/if}
  {#if ready && !records.length}
    <p class="text-muted-foreground p-6 text-sm">
      {search || setting || archived
        ? 'No matching records.'
        : 'No records in this session yet.'}
    </p>
  {:else if !failure || records.length}
    <div
      aria-hidden="true"
      class={cx(
        columns,
        'text-muted-foreground mx-5 hidden pt-4 text-xs font-medium sm:grid',
      )}
    >
      <span>Record</span><span>Setting</span><span>Recorded</span>
    </div>
    <ResourceIndex
      entities={records}
      isInitialised={ready}
      hasMore={next !== null && !failure}
      isLoadingMore={loading}
      onNearEnd={load}
      getRowSelectionState={record => (selected.has(record.id) ? 'selected' : null)}
      onRowSelectionToggle={bulk ? toggleRecord : undefined}
    >
      {#snippet row(record, _index, selectionState)}
        {@const rowClass = getRowRootClass({
          interactive: bulk || Boolean(record.featureId),
          selectionState,
          className: cx(columns, 'min-h-18 w-full py-1 text-left'),
        })}
        {@const identity = record.featureId ?? record.id}
        {@const identicon = getFeatureIdenticonUrl(
          `${identity}:${record.title?.trim() || identity}`,
        )}
        {@const original = record.thumbnailRevision
          ? `/api/images/revisions/${encodeURIComponent(record.thumbnailRevision)}`
          : null}
        {#snippet cells()}
          <span
            class="flex min-w-0 items-center gap-3"
            title={record.title ?? undefined}
          >
            {#key record.thumbnailRevision}
              <img
                src={original
                  ? `${original}?t=${recorderPhotoThumbnailTransform}`
                  : identicon}
                alt=""
                loading="lazy"
                decoding="async"
                class="size-14 shrink-0 rounded-lg object-cover"
                onerror={event => {
                  const image = event.currentTarget
                  if (!(image instanceof HTMLImageElement)) return
                  const failed = image.getAttribute('src')
                  if (failed === identicon) return
                  image.src = original && failed !== original ? original : identicon
                }}
              >
            {/key}
            <span class="grid min-w-0 gap-1 break-words whitespace-normal">
              <strong class="font-semibold"
                >{record.address ||
                  record.customTitle ||
                  (record.identifierTags.length
                    ? 'No address recorded'
                    : 'Untitled record')}</strong
              >
              {#if record.address && record.customTitle}
                <span class="text-muted-foreground text-sm">{record.customTitle}</span>
              {/if}
              {#if record.identifierTags.length}
                <span class="flex flex-wrap items-center gap-1.5">
                  {#each record.identifierTags as tag}
                    <span class="bg-base-300 rounded-md px-2 py-0.5 font-mono text-xs"
                      >{tag}</span
                    >
                  {/each}
                </span>
              {/if}
            </span>
          </span>
          <span class="text-muted-foreground text-sm capitalize"
            >{record.spatialRealm ?? '—'}</span
          >
          <span class="text-muted-foreground col-span-2 text-sm sm:col-span-1">
            {#if record.recordedAt}
              <time datetime={record.recordedAt}
                >{dateFormat.format(new Date(record.recordedAt))}</time
              >
            {:else}
              <span aria-hidden="true">—</span
              ><span class="sr-only">Recording time unavailable</span>
            {/if}
          </span>
        {/snippet}
        {#if bulk}
          <button type="button" aria-pressed={Boolean(selectionState)} class={rowClass}>
            {@render cells()}
          </button>
        {:else if record.featureId}
          <a
            href={`/admin/features/${encodeURIComponent(record.featureId)}`}
            class={rowClass}
            >{@render cells()}</a
          >
        {:else}
          <div class={rowClass}>{@render cells()}</div>
        {/if}
      {/snippet}
    </ResourceIndex>
  {/if}
</section>
