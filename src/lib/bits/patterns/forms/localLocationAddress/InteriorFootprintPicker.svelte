<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
// API
import {
  findLocationInteriorFootprints,
  prepareLocationInteriorFootprint,
} from '#lib/api/locationInteriorFootprint.remote.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// COMPONENTS
import ExteriorFootprintPicker from './ExteriorFootprintPicker.svelte'
// DOMAIN
import { mapHash } from '#lib/indoor/releases.js'
import { footprintFloorplan } from '#lib/indoor/floorplans/footprint.js'

let {
  locationId,
  onprepared,
  oncancel,
}: {
  locationId: string
  onprepared: (jobId: string) => Promise<void>
  oncancel: () => void
} = $props()
let result = $state<Awaited<ReturnType<typeof findLocationInteriorFootprints>> | null>(
  null,
)
let selected = $state('')
let polygonIndex = $state(0)
let search = $state('')
let label = $state('')
let busy = $state(false)
let loading = $state(true)
let message = $state('')
let disposed = false
const footprint = $derived(
  result?.footprints.features.find(item => item.properties.csuid === selected),
)
const polygons = $derived(
  footprint?.geometry.type === 'MultiPolygon' ? footprint.geometry.coordinates : [],
)
const partPreview = $derived.by(() => {
  if (!footprint || polygons.length < 2) return null
  try {
    return (
      'data:image/svg+xml,' +
      encodeURIComponent(footprintFloorplan(footprint, polygonIndex, 'Preview').image)
    )
  } catch {
    return null
  }
})
const matches = $derived(
  (result?.footprints.features ?? [])
    .filter(item =>
      [item.properties.name, item.properties.nameZh, item.properties.csuid]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    )
    .slice(0, 40),
)

/** Load outlines around the building's saved position. @returns Completion. */
async function load(): Promise<void> {
  loading = true
  message = ''
  try {
    const query = findLocationInteriorFootprints({ locationId })
    await query.refresh()
    const next = await query
    if (!disposed) result = next
  } catch {
    if (!disposed)
      message = 'Could not load building footprints. Retry or upload a floor plan.'
  } finally {
    if (!disposed) loading = false
  }
}
/** Select the same source from map or keyboard-accessible results. @param id Footprint ID. @returns Nothing. */
function select(id: string): void {
  if (busy) return
  selected = id
  polygonIndex = 0
}
/** Prepare a review draft only after the user selects the footprint and names a floor. @returns Completion. */
async function prepare(): Promise<void> {
  if (!result || !footprint || !label.trim() || busy) return
  busy = true
  message = ''
  try {
    const job = await prepareLocationInteriorFootprint({
      locationId,
      revisionId: result.revisionId,
      footprintId: selected,
      footprintHash: await mapHash(JSON.stringify($state.snapshot(footprint))),
      polygonIndex,
      label,
    })
    if (!disposed) await onprepared(job.id)
  } catch (error) {
    if (!disposed)
      message =
        error instanceof Error ? error.message : 'Could not prepare this footprint.'
  } finally {
    if (!disposed) busy = false
  }
}
onMount(() => {
  void load()
})
onDestroy(() => {
  disposed = true
})
</script>

<section aria-label="Choose a floor footprint" class="flex min-h-0 flex-1 flex-col">
  <div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
    <div>
      <h2 class="text-sm font-medium">Select the footprint for this address</h2>
      <p class="text-muted-foreground text-xs">
        Use the building outline as a starting point, then draw and review the interior
        spaces.
      </p>
    </div>
    <Button text="Cancel map selection" disabled={busy} onClick={oncancel} />
  </div>
  {#if message}
    <div class="space-y-2 p-4">
      <p role="alert" class="text-error text-sm">{message}</p>
      {#if !result}
        <Button text="Retry loading footprints" onClick={load} />
      {/if}
    </div>
  {/if}
  {#if loading}
    <div
      role="status"
      aria-label="Preparing footprint map"
      class="grid min-h-96 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div class="bg-muted min-h-80 animate-pulse rounded"></div>
      <div class="bg-muted min-h-40 animate-pulse rounded"></div>
    </div>
  {:else if result}
    {#if result.footprints.features.length}
      <div class="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ExteriorFootprintPicker
          coordinates={result.coordinates}
          footprints={result.footprints}
          selectedFootprint={selected}
          onselect={select}
          showAddress
          class="h-full min-h-96"
        />
        <div class="space-y-4 overflow-y-auto border-l p-4">
          <label class="grid gap-1 text-sm"
            >Search building footprints<input
              class="w-full rounded border p-2"
              bind:value={search}
              placeholder="Building name or footprint ID"
              disabled={busy}
            ></label
          >
          <fieldset
            class="max-h-48 space-y-1 overflow-y-auto"
            aria-label="Nearby building footprints"
          >
            {#each matches as item (item.properties.csuid)}
              <button
                type="button"
                aria-pressed={selected === item.properties.csuid}
                disabled={busy}
                onclick={() => select(item.properties.csuid)}
                class="hover:bg-muted w-full rounded border p-2 text-left text-sm aria-pressed:border-orange-600 aria-pressed:bg-orange-50"
              >
                <span class="block break-words whitespace-normal"
                  >{item.properties.name ||
                    item.properties.nameZh ||
                    'Unnamed building'}</span
                >
                <span class="text-muted-foreground text-xs"
                  >{item.properties.csuid}</span
                >
              </button>
            {:else}
              <p class="text-muted-foreground text-sm">
                No matching footprints. Select an outline on the map or try another
                name.
              </p>
            {/each}
          </fieldset>
          {#if footprint}
            <p class="text-sm">
              Selected:
              {footprint.properties.name ||
                footprint.properties.nameZh ||
                footprint.properties.csuid}
            </p>
            {#if polygons.length > 1}
              <label class="grid gap-1 text-sm"
                >Footprint part<select
                  bind:value={polygonIndex}
                  class="rounded border p-2"
                  disabled={busy}
                >
                  {#each polygons as _, index}
                    <option value={index}>Part {index + 1} of {polygons.length}</option>
                  {/each}
                </select></label
              >
              {#if partPreview}
                <img
                  src={partPreview}
                  alt={`Selected footprint part ${polygonIndex + 1}`}
                  class="h-32 w-full border object-contain"
                >
              {/if}
            {/if}
          {:else}
            <p class="text-muted-foreground text-sm">
              Select a building on the map or in the list.
            </p>
          {/if}
          <label class="grid gap-1 text-sm"
            >Floor name<input
              bind:value={label}
              maxlength="200"
              placeholder="e.g. Ground floor"
              class="w-full rounded border p-2"
              disabled={busy}
            ></label
          >
          <p class="text-muted-foreground text-xs">
            A footprint does not show rooms or confirm the shape of each floor. Check
            the selected outline before saving.
          </p>
          <Button
            text="Use footprint"
            disabled={busy || !footprint || !label.trim()}
            onClick={prepare}
          />
          {#if busy}
            <div
              role="status"
              aria-label="Preparing floor boundary"
              class="bg-muted h-10 animate-pulse rounded"
            ></div>
          {/if}
        </div>
      </div>
    {:else}
      <p class="text-muted-foreground p-4 text-sm">
        No building footprints are available around this address. You can upload a floor
        plan instead.
      </p>
    {/if}
  {/if}
</section>
