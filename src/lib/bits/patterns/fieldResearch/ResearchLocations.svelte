<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// API
import {
  getResearchLocations,
  addResearchLocation,
  removeResearchLocation,
} from '#lib/api/fieldResearchLocations.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
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
let added = $state<Awaited<ReturnType<typeof getResearchLocations>>>([])
let busy = $state(false)
let failure = $state('')
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
    throw error
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
  <div class="space-y-4 px-6 py-5">
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
    {#key `${active}-${mode}`}
      <ResearchLocationPicker
        {projectId}
        {mode}
        kind={active}
        disabled={busy || disabled}
        onSelect={id => add(id, 'single')}
      />
    {/key}
    <details>
      <summary class="cursor-pointer text-sm font-medium">
        Added Locations ({added.length})
      </summary>
      <ul class="mt-2 space-y-2">
        {#each added as item (item.id)}
          <li class="flex items-center justify-between gap-2 text-sm">
            <span>{item.name} · {item.kind.replace('_', ' ')}</span>
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
