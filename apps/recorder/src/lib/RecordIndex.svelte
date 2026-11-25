<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { t } from './i18n'
// COMPONENTS
import RecordIdentity from './RecordIdentity.svelte'
// API
import { photoThumbnail, retryOriginal } from './hype'
import { readRecorderPlan } from './recorderPlan'
// DOMAIN
import { value } from '../../../../src/lib/indoor/model'
import {
  recordGroups,
  type IndexRow,
  type IndexView,
  type PlanFloor,
  type RecordSection,
} from './recordGroups'
// TYPES
import type {
  RecorderRecord,
  RecorderLocation,
} from '../../../../src/lib/fieldResearch/recorder'

let {
  records,
  places,
  view = $bindable(),
  recordAddress,
  onedit,
  onmap,
}: {
  records: RecorderRecord[]
  places: RecorderLocation[]
  view: IndexView
  recordAddress: (record: RecorderRecord) => string
  onedit: (id: string) => void
  onmap: (id: string) => void
} = $props()

let rows = $derived.by(() => {
  const numbered = records.map((record, i) => ({ record, number: i + 1 }))
  return view.oldestFirst ? numbered : numbered.reverse()
})
let plans = $state.raw(new Map<string, Map<string, PlanFloor>>())
$effect(() => {
  if (view.mode !== 'floor') return
  const releases = new Map<string, string>()
  for (const { pin } of records) {
    if (pin?.realm === 'interior') releases.set(pin.hash, pin.mapId)
  }
  const controller = new AbortController()
  // Read each pinned release once per view, sequentially to limit memory on the phone.
  async function loadFloors() {
    for (const [hash, id] of releases) {
      if (controller.signal.aborted) return
      if (plans.has(hash)) continue
      try {
        const plan = await readRecorderPlan({ id, hash }, controller.signal)
        if (!plan || controller.signal.aborted) continue
        const levels = new Map<string, PlanFloor>()
        for (const { properties } of plan.data.level_polygon.features) {
          levels.set(value(properties, 'level_id'), {
            label:
              value(properties, 'level_name_en') ||
              value(properties, 'level_name_zh') ||
              value(properties, 'level_short_name_en'),
            ordinal:
              typeof properties.level_ordinal === 'number'
                ? properties.level_ordinal
                : undefined,
          })
        }
        plans = new Map(plans).set(hash, levels)
      } catch {
        // Keep every record accessible even when its immutable drawing is unavailable.
      }
    }
  }
  untrack(() => void loadFloors())
  return () => controller.abort()
})
let buildings = $derived(
  view.mode === 'all' ? [] : recordGroups(rows, places, view.mode === 'floor', plans),
)
let sections = $derived(buildings.flatMap(b => [b.key, ...b.floors.map(f => f.key)]))
let closed = $derived(new Set(view.collapsed))
let allClosed = $derived(
  buildings.length > 0 && buildings.every(b => closed.has(b.key)),
)
const modes = ['all', 'building', 'floor'] as const
const modeLabels = {
  all: 'ungrouped_records',
  building: 'building',
  floor: 'building_and_floor',
} as const
function toggle(key: string): void {
  view.collapsed = closed.has(key)
    ? view.collapsed.filter(id => id !== key)
    : [...view.collapsed, key]
}
</script>

{#snippet cards(items: IndexRow[])}
  <ol class="grid gap-2">
    {#each items as { record: row, number } (row.id)}
      {@const address = recordAddress(row)}
      {@const tags = row.identifierTags ?? []}
      {@const label = row.title || t('record_number', { number })}
      <li class="bg-panel overflow-hidden rounded-2xl">
        <button
          type="button"
          class="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
          aria-label={tags.length ? [address, ...tags].join(' · ') : label}
          onclick={() => onedit(row.id)}
        >
          {#if row.thumbnailRevision}
            <img
              class="bg-surface size-16 shrink-0 rounded-lg object-cover"
              loading="lazy"
              alt=""
              src={photoThumbnail(row.thumbnailRevision)}
              onerror={event => retryOriginal(event.currentTarget)}
            >
          {/if}
          <RecordIdentity {address} {tags} title={label} realm={row.spatialRealm} />
        </button>
        {#if row.pin}
          <button
            type="button"
            class="text-accent min-h-11 px-4"
            onclick={() => onmap(row.id)}
          >
            {t('view_on_map')}
          </button>
        {/if}
      </li>
    {:else}
      <li class="text-muted">{t('no_records_yet')}</li>
    {/each}
  </ol>
{/snippet}

{#snippet header(section: RecordSection, floor: boolean)}
  <svelte:element this={floor ? 'h4' : 'h3'}>
    <button
      type="button"
      aria-expanded={!closed.has(section.key)}
      onclick={() => toggle(section.key)}
      class={[
        'flex min-h-11 w-full items-center gap-2 text-left',
        floor ? 'text-muted text-sm' : 'border-line border-t font-semibold',
      ]}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={['size-4 shrink-0', !closed.has(section.key) && 'rotate-90']}
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
      <span class="min-w-0 flex-1 break-words">{section.label}</span>
      <span class="text-muted px-1 font-mono text-xs">{section.rows.length}</span>
    </button>
  </svelte:element>
{/snippet}

{#if records.length}
  <div class="text-muted flex flex-wrap items-center gap-x-2">
    <button
      type="button"
      aria-label={t('group_records', { mode: t(modeLabels[view.mode]) })}
      onclick={() => (view.mode = modes[(modes.indexOf(view.mode) + 1) % modes.length])}
      class="bg-panel border-line inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
    >
      <svg
        aria-hidden="true"
        class="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      >
        <path d="m3 7 9-5 9 5-9 5zM3 12l9 5 9-5M3 17l9 5 9-5" />
      </svg>
      {t(modeLabels[view.mode])}
    </button>
    <button
      type="button"
      onclick={() => (view.oldestFirst = !view.oldestFirst)}
      class="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm"
    >
      <svg
        aria-hidden="true"
        class={['size-4', view.oldestFirst && 'rotate-180']}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      >
        <path d="M5 3v17m-4-5 4 5 4-5M12 5h10m-10 6h7m-7 6h4" />
      </svg>
      {t(view.oldestFirst ? 'oldest_first' : 'newest_first')}
    </button>
    {#if buildings.length}
      <button
        type="button"
        aria-label={t(allClosed ? 'expand_sections' : 'collapse_sections')}
        title={t(allClosed ? 'expand_sections' : 'collapse_sections')}
        onclick={() => (view.collapsed = allClosed ? [] : sections)}
        class="ml-auto grid size-11 place-items-center"
      >
        <svg
          aria-hidden="true"
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
        >
          <path
            d={allClosed ? 'm7 8 5-5 5 5M7 16l5 5 5-5' : 'm7 3 5 5 5-5M7 21l5-5 5 5'}
          />
        </svg>
      </button>
    {/if}
  </div>
{/if}
{#if view.mode === 'all' || !rows.length}
  {@render cards(rows)}
{:else}
  {#each buildings as building (building.key)}
    <section>
      {@render header(building, false)}
      {#if !closed.has(building.key)}
        {#if view.mode === 'building'}
          {@render cards(building.rows)}
        {:else}
          <div class="border-line ml-2 grid gap-1 border-l pl-3">
            {#each building.floors as floor (floor.key)}
              <section>
                {@render header(floor, true)}
                {#if !closed.has(floor.key)}
                  {@render cards(floor.rows)}
                {/if}
              </section>
            {/each}
          </div>
        {/if}
      {/if}
    </section>
  {/each}
{/if}
