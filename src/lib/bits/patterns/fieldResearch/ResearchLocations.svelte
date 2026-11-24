<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// I18N
import { getLocale } from '#lib/i18n.js'
import { buildingNameLabel } from '#lib/locations/kinds.i18n.js'
// API
import {
  getResearchLocations,
  addResearchLocation,
  removeResearchLocation,
} from '#lib/api/fieldResearchLocations.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import SearchIcon from 'virtual:icons/lucide/search'
import MapIcon from 'virtual:icons/lucide/map'
import LocationIcon from 'virtual:icons/proicons/location'
import PremisesIcon from 'virtual:icons/lucide/building'
import BuildingIcon from 'virtual:icons/lucide/building-2'
import PartIcon from 'virtual:icons/lucide/door-open'
import EstablishmentIcon from 'virtual:icons/lucide/store'
import OperationalIcon from 'virtual:icons/lucide/settings'
// COMPONENTS
import ResearchLocationPicker from './ResearchLocationPicker.svelte'
let {
  sessionId,
  projectId,
  revision,
  disabled = false,
  onSaved,
}: {
  sessionId: string
  projectId: string
  revision: number
  disabled?: boolean
  onSaved: () => Promise<void>
} = $props()
let mode = $state<'search' | 'map'>('search')
let active = $state<'premises' | 'building' | 'building_part'>('premises')
let rows = $state<Awaited<ReturnType<typeof getResearchLocations>>>([])
const added = $derived(
  rows
    .map(row => ({
      ...row,
      name:
        row.kind === 'building'
          ? buildingNameLabel(row.names, row.confirmedUnnamed)
          : row.names.en?.trim() ||
            Object.values(row.names).find(name => name.trim()) ||
            row.address ||
            (row.kind === 'building_part'
              ? 'Unnamed building part'
              : 'Unnamed premises'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, getLocale())),
)
let busy = $state(false)
let loaded = $state(false)
let failure = $state('')
const control = 'rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm'
const kinds = [
  { id: 'premises', label: 'Premises', icon: PremisesIcon },
  { id: 'building', label: 'Buildings', icon: BuildingIcon },
  { id: 'building_part', label: 'Building parts', icon: PartIcon },
] as const
/** Load persisted vetted Locations. @returns Once the list is refreshed. */
async function load(): Promise<void> {
  rows = await refreshRemoteQuery(getResearchLocations({ sessionId, revision }))
  loaded = true
}
/** Persist a single vetted choice or a relationship expansion. @param locationId Selected Location. @param mode Expansion mode. @returns Once refreshed. */
async function add(
  locationId: string,
  mode: 'single' | 'buildings' | 'buildings_and_parts' | 'building_and_parts',
): Promise<void> {
  if (busy || disabled) return
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
    throw error
  } finally {
    busy = false
  }
}
/** Remove one selected Location. @param locationId Location identity. @returns Once refreshed. */
async function remove(locationId: string): Promise<void> {
  if (busy || disabled) return
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
    class="relative z-10 shadow-sm"
    title="Locations for this session"
    icon={LocationIcon}
    description="Choose the Locations that can be used during recording."
  >
    {#snippet right()}
      <fieldset
        aria-label="Location selection method"
        class="border-border inline-flex rounded-lg border p-1"
      >
        {#each [
          { value: 'search', label: 'Search', icon: SearchIcon },
          { value: 'map', label: 'Map based', icon: MapIcon },
        ] as option}
          <button
            type="button"
            aria-label={option.label}
            title={option.label}
            aria-pressed={mode === option.value}
            class="text-muted-foreground hover:bg-muted aria-pressed:bg-background aria-pressed:text-primary rounded-md p-2 aria-pressed:shadow-sm"
            disabled={busy}
            onclick={() => (mode = option.value as 'search' | 'map')}
          >
            <option.icon class="size-5" />
          </button>
        {/each}
      </fieldset>
    {/snippet}
  </SectionHeader>
  <div class="grid items-start gap-6 px-6 py-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="min-w-0 space-y-4">
      <p class="text-muted-foreground text-sm">
        Related buildings and parts are added only when a current relationship exists.
      </p>
      {#if failure}
        <p role="alert" class="text-error text-sm">{failure}</p>
      {/if}
      <fieldset aria-label="Location type" class="flex flex-wrap gap-2">
        {#each kinds as item}
          <button
            type="button"
            aria-pressed={active === item.id}
            class={`${control} aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary`}
            disabled={busy}
            onclick={() => {
              active = item.id
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
          <OperationalIcon class="mr-1 inline size-4" />Service Points
        </button>
      </fieldset>
      {#if loaded}
        {#key `${active}-${mode}`}
          <ResearchLocationPicker
            {projectId}
            included={added}
            {mode}
            kind={active}
            disabled={busy || disabled}
            onSelect={id => add(id, 'single')}
          />
        {/key}
      {:else}
        <div
          role="status"
          aria-label="Loading Locations"
          class="animate-pulse space-y-4"
        >
          <div class="bg-muted h-10 w-64 max-w-full rounded-lg"></div>
          {#if mode === 'search'}
            <div class="flex items-center gap-2">
              <div class="bg-muted h-5 w-12 rounded"></div>
              <div class="bg-muted h-10 w-28 rounded-lg"></div>
              <div class="bg-muted h-10 min-w-0 flex-1 rounded-lg"></div>
              <div class="bg-muted h-10 w-10 rounded-lg"></div>
              <div class="bg-muted h-10 w-20 rounded-lg"></div>
            </div>
            <div class="grid grid-cols-2 gap-6 py-10">
              {#each [1, 2] as column (column)}
                <div class="flex flex-col items-center gap-3">
                  <div class="bg-muted h-5 w-44 max-w-full rounded"></div>
                  <div class="bg-muted h-4 w-40 max-w-full rounded"></div>
                  <div class="bg-muted mt-3 h-4 w-28 max-w-full rounded"></div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="bg-muted h-5 w-full max-w-xl rounded"></div>
            <div class="bg-muted h-[28rem] rounded-lg"></div>
          {/if}
        </div>
      {/if}
    </div>
    <aside
      aria-label="Included Locations"
      class="border-border bg-panel text-foreground overflow-hidden rounded-xl border xl:sticky xl:top-4"
    >
      <div class="border-border flex items-center gap-2 border-b px-4 py-4">
        <LocationIcon class="size-5" />
        <h3 class="font-semibold">Included Locations</h3>
        {#if loaded}
          <span class="bg-muted ml-auto rounded-full px-2 py-0.5 text-xs tabular-nums"
            >{added.length}</span
          >
        {:else}
          <span class="bg-muted ml-auto h-5 w-6 animate-pulse rounded-full"></span>
        {/if}
      </div>
      {#if !loaded}
        <div
          role="status"
          aria-label="Loading included Locations"
          class="space-y-3 p-4"
        >
          <div class="flex animate-pulse gap-3">
            <div class="bg-muted mt-1 size-5 shrink-0 rounded"></div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex h-6 items-center gap-1.5">
                <div class="bg-muted mr-auto h-3 w-20 rounded"></div>
                <div class="bg-muted size-2 rounded-full"></div>
                <div class="bg-muted size-2 rounded-full"></div>
              </div>
              <div class="bg-muted h-5 w-3/4 rounded"></div>
              <div class="bg-muted h-4 w-full rounded"></div>
            </div>
          </div>
          <div class="flex animate-pulse gap-2 pt-1">
            <div class="bg-muted h-10 w-48 rounded-lg"></div>
            <div class="bg-muted h-10 w-20 rounded-lg"></div>
          </div>
        </div>
      {:else if !added.length}
        <p class="text-muted-foreground p-4 text-sm">
          No Locations yet. Select a search result or a building on the map to add it.
        </p>
      {:else}
        <ul class="divide-border divide-y">
          {#each added as item (item.id)}
            {@const type = kinds.find(kind => kind.id === item.kind)}
            {@const Icon = type?.icon ?? LocationIcon}
            {@const exteriorStatus = item.hasExteriorMap ? 'available' : 'unavailable'}
            {@const interiorStatus = item.hasInteriorMap ? 'available' : 'unavailable'}
            <li class="space-y-3 p-4">
              <div class="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3">
                <Icon class="text-primary mt-1 size-5" />
                <div class="min-w-0">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-muted-foreground text-xs">
                      {item.kind === 'building_part'
                        ? 'Building part'
                        : item.kind === 'premises'
                          ? 'Premises'
                          : 'Building'}
                    </p>
                    <SimpleTooltip
                      triggerClass="focus-visible:outline-ring h-6 shrink-0 cursor-help items-center gap-1.5 rounded px-1 focus-visible:outline-2"
                      triggerProps={{
                        role: 'button',
                        'aria-label': `Interior map ${interiorStatus}, exterior map ${exteriorStatus}`,
                      }}
                      contentProps={{ align: 'end' }}
                    >
                      {#snippet trigger()}
                        {#each [item.hasInteriorMap, item.hasExteriorMap] as available}
                          <span
                            aria-hidden="true"
                            class={`size-2 rounded-full border ${available ? 'border-success bg-success' : 'border-muted-foreground/60'}`}
                          ></span>
                        {/each}
                      {/snippet}
                      <p>Interior {interiorStatus}</p>
                      <p>Exterior {exteriorStatus}</p>
                    </SimpleTooltip>
                  </div>
                  <a
                    href={'/admin/locations/' + item.id}
                    class="font-semibold break-words whitespace-normal hover:underline"
                    >{item.name}</a
                  >
                  {#if item.address && item.address !== item.name}
                    <p
                      class="text-muted-foreground mt-1 text-sm break-words whitespace-normal"
                    >
                      {item.address}
                    </p>
                  {/if}
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                {#if item.kind === 'premises' || item.kind === 'building'}
                  <button
                    type="button"
                    class={control}
                    disabled={busy || disabled}
                    onclick={() =>
                      add(
                        item.id,
                        item.kind === 'premises'
                          ? 'buildings_and_parts'
                          : 'building_and_parts',
                      ).catch(() => {})}
                  >
                    Add related buildings and parts
                  </button>
                {/if}
                <button
                  type="button"
                  class={control}
                  disabled={busy || disabled}
                  aria-label={'Remove ' + item.name + ' from session'}
                  onclick={() => remove(item.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  </div>
</section>
