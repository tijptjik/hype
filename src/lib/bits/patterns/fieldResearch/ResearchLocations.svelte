<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// API
import {
  searchResearchLocations,
  getResearchLocations,
  addResearchLocation,
  addResearchParts,
  removeResearchLocation,
} from '#lib/api/fieldResearchLocations.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
// ICONS
import LocationIcon from 'virtual:icons/proicons/location'
import PremisesIcon from 'virtual:icons/lucide/building'
import BuildingIcon from 'virtual:icons/lucide/building-2'
import PartIcon from 'virtual:icons/lucide/door-open'
import EstablishmentIcon from 'virtual:icons/lucide/store'
import OperationalIcon from 'virtual:icons/lucide/settings'
// TYPES
import type { LocationResource } from '#lib/locations/resource.js'
let {
  sessionId,
  revision,
  disabled = false,
  onSaved,
}: {
  sessionId: string
  revision: number
  disabled?: boolean
  onSaved: () => Promise<void>
} = $props()
let active = $state<'premises' | 'building' | 'building_part'>('premises')
let query = $state('')
let results = $state<LocationResource[]>([])
let selected = $state<string[]>([])
let added = $state<Awaited<ReturnType<typeof getResearchLocations>>>([])
let cursor = $state<string | null>(null)
let busy = $state(false)
let failure = $state('')
let searched = $state(false)
const control = 'rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm'
const kinds = [
  { id: 'premises', label: 'Premises', icon: PremisesIcon },
  { id: 'building', label: 'Buildings', icon: BuildingIcon },
  { id: 'building_part', label: 'Building parts', icon: PartIcon },
] as const
/** Load persisted vetted Locations. @returns Once the list is refreshed. */
async function load(): Promise<void> {
  added = await refreshRemoteQuery(getResearchLocations({ sessionId, revision }))
}
/** Search the project-visible directory and retain pagination. @param next Append the next page. @returns Once results arrive. */
async function search(next = false): Promise<void> {
  if (!query.trim()) return
  busy = true
  failure = ''
  try {
    const page = await searchResearchLocations({
      sessionId,
      kind: active,
      q: query,
      after: next ? (cursor ?? undefined) : undefined,
    })
    results = next ? [...results, ...page.data] : page.data
    cursor = page.nextCursor
    searched = true
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
/** Persist a single vetted choice or a relationship expansion. @param locationId Selected Location. @param mode Expansion mode. @returns Once refreshed. */
async function add(
  locationId: string,
  mode: 'single' | 'buildings' | 'buildings_and_parts' | 'building_and_parts',
): Promise<void> {
  busy = true
  failure = ''
  try {
    const result = await addResearchLocation({ sessionId, revision, locationId, mode })
    if (!result.count) failure = 'No linked Locations were found for this choice.'
    else {
      await onSaved()
      await load()
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
/** Persist all checked building parts together. @returns Once refreshed. */
async function addParts(): Promise<void> {
  busy = true
  failure = ''
  try {
    await addResearchParts({ sessionId, revision, locationIds: selected })
    selected = []
    await onSaved()
    await load()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
/** Remove one selected Location. @param locationId Location identity. @returns Once refreshed. */
async function remove(locationId: string): Promise<void> {
  busy = true
  failure = ''
  try {
    await removeResearchLocation({ sessionId, revision, locationId })
    await onSaved()
    await load()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
onMount(() => void load().catch(error => (failure = String(error))))
</script>
<section aria-label="Vetted Locations">
  <SectionHeader
    title="Locations for this session"
    icon={LocationIcon}
    description="Choose the Locations that can be used during recording."
  />
  <div class="space-y-4 px-6 py-5">
    <p class="text-muted-foreground text-sm">
      Related buildings and parts are added only when a current relationship exists.
    </p>
    {#if failure}
      <p role="alert" class="text-error text-sm">{failure}</p>
    {/if}
    <div role="group" aria-label="Location type" class="flex flex-wrap gap-2">
      {#each kinds as item}
        <button
          type="button"
          aria-pressed={active === item.id}
          class={`${control} aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary`}
          disabled={busy}
          onclick={() => {
            active = item.id
            results = []
            selected = []
            searched = false
            cursor = null
          }}
        >
          <item.icon class="mr-1 inline size-4" />{item.label}
        </button>
      {/each}
      <button
        type="button"
        class={`${control} opacity-40`}
        disabled
        title="Coming later"
      >
        <EstablishmentIcon class="mr-1 inline size-4" />Establishments
      </button>
      <button
        type="button"
        class={`${control} opacity-40`}
        disabled
        title="Coming later"
      >
        <OperationalIcon class="mr-1 inline size-4" />Other operational Locations
      </button>
    </div>
    <form
      class="flex gap-2"
      onsubmit={event => {
        event.preventDefault()
        void search()
      }}
    >
      <label class="min-w-0 flex-1"
        ><span class="sr-only">Search Locations</span>
        <input
          class={`${control} w-full`}
          bind:value={query}
          placeholder="Search by name or ID"
        ></label
      ><button class={control} disabled={busy || !query.trim()}>Search</button>
    </form>
    {#if searched && !results.length}
      <p class="text-muted-foreground text-sm">No matching Locations.</p>
    {/if}
    <ul class="divide-border divide-y">
      {#each results as result (result.id)}
        {@const isAdded = added.some(item => item.id === result.id)}
        <li
          data-location-id={result.id}
          class="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <span class="min-w-0 break-words"
            >{result.facts?.names?.en || result.id}
            {#if isAdded}
              <span class="text-muted-foreground ml-2 text-xs">Added</span>
            {/if}</span
          >
          <span class="flex flex-wrap gap-2">
            {#if isAdded}
              <button
                type="button"
                class={control}
                disabled={busy || disabled}
                onclick={() => remove(result.id)}
              >
                Remove
              </button>
            {:else if active === 'building_part'}
              <label class="text-sm"
                ><input
                  type="checkbox"
                  value={result.id}
                  checked={selected.includes(result.id)}
                  onchange={event => {
                    selected = event.currentTarget.checked
                      ? [...selected, result.id]
                      : selected.filter(id => id !== result.id)
                  }}
                  disabled={busy || disabled}
                >
                Select</label
              >
            {:else if active === 'premises'}
              <button
                type="button"
                class={control}
                disabled={busy || disabled}
                onclick={() => add(result.id, 'single')}
              >
                Add premises
              </button>
            {:else}
              <button
                type="button"
                class={control}
                disabled={busy || disabled}
                onclick={() => add(result.id, 'single')}
              >
                Use building
              </button>
            {/if}
            {#if active === 'premises'}
              <button
                type="button"
                class={control}
                disabled={busy || disabled}
                onclick={() => add(result.id, 'buildings')}
              >
                Add all buildings
              </button><button
                type="button"
                class={control}
                disabled={busy || disabled}
                onclick={() => add(result.id, 'buildings_and_parts')}
              >
                Add all buildings and their parts
              </button>
            {:else if active === 'building'}
              <button
                type="button"
                class={control}
                disabled={busy || disabled}
                onclick={() => add(result.id, 'building_and_parts')}
              >
                Use building and its parts
              </button>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
    {#if cursor}
      <button
        type="button"
        class={control}
        disabled={busy}
        onclick={() => search(true)}
      >
        Load more
      </button>
    {/if}
    {#if active === 'building_part'}
      <button
        type="button"
        class={control}
        disabled={busy || disabled || !selected.length}
        onclick={addParts}
      >
        Add selected parts ({selected.length})
      </button>
    {/if}
    <details>
      <summary class="cursor-pointer text-sm font-medium">
        Added Locations ({added.length})
      </summary>
      <ul class="mt-2 space-y-2">
        {#each added as item (item.id)}
          <li class="flex items-center justify-between gap-2 text-sm">
            <span>{item.name} · {item.kind.replace('_', ' ')}</span
            ><button
              type="button"
              class={control}
              disabled={busy || disabled}
              onclick={() => remove(item.id)}
            >
              Remove
            </button>
          </li>
        {/each}
      </ul>
    </details>
  </div>
</section>
