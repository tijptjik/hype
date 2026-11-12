<script lang="ts">
// SVELTE
import { untrack, onDestroy } from 'svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// COMPONENTS
import CreateLocalLocation from './CreateLocalLocation.svelte'
// API
import { importBuildingLocation } from '#lib/api/buildingLocation.remote.js'
// DOMAIN
import { suggestAddressBuildings } from '#lib/locations/buildingSuggestions.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { BuildingSearchResult } from '#lib/locations/buildingSearch.js'
import type { LocationSearchMarker } from '#lib/locations/searchPresentation.js'

let {
  projectId,
  address,
  buildingId = $bindable(''),
  onMapCandidates,
  onBuildingChange,
}: {
  projectId: string
  address: FeatureAddress
  buildingId?: string
  onMapCandidates?: (
    markers: LocationSearchMarker[],
    select: (id: string) => void,
  ) => void
  onBuildingChange: () => void
} = $props()
let rows = $state<BuildingSearchResult[]>([])
let selected = $state<BuildingSearchResult | null>(null)
let loading = $state(false)
let failed = $state(false)
let exact = $state(false)
let busy = $state(false)
let fallback = $state(false)
let retry = $state(0)
let localName = $state('')
let active = true
let requestVersion = 0
let lookupKey = ''
onDestroy(() => {
  active = false
})
$effect(() => {
  const source = $state.snapshot(address)
  const locale = getLocaleKey()
  retry
  const key = JSON.stringify([projectId, source])
  requestVersion++
  untrack(() => {
    if (lookupKey && lookupKey !== key) {
      buildingId = ''
      selected = null
      rows = []
      localName = ''
      onBuildingChange()
    }
    lookupKey = key
  })
  let current = true
  untrack(() => {
    loading = true
    failed = false
  })
  void suggestAddressBuildings(source, locale, () => current)
    .then(result => {
      if (!current) return
      rows = result.rows
      exact = result.exact
      if (!buildingId)
        selected = result.exact && result.rows.length === 1 ? result.rows[0] : null
    })
    .catch(() => {
      if (current) failed = true
    })
    .finally(() => {
      if (current) loading = false
    })
  return () => {
    current = false
  }
})
/** Select a suggestion without creating an identity; invalidate the enclosing chain on change.
 * @param row Published building evidence. @returns Nothing.
 */
function select(row: BuildingSearchResult): void {
  if (busy || selected?.id === row.id) return
  selected = row
  buildingId = ''
  localName = ''
  onBuildingChange()
}
$effect(() => {
  const markers: LocationSearchMarker[] = rows.flatMap((row, index) =>
    row.address.coordinates
      ? [
          {
            id: row.id,
            kind: 'building',
            number: index + 1,
            coordinates: row.address.coordinates,
            label: Object.values(row.names).find(Boolean) ?? row.id,
            selected: selected?.id === row.id,
            fitGroup: 'building-parent-suggestions',
            previewOnly: true,
          },
        ]
      : [],
  )
  untrack(() =>
    onMapCandidates?.(markers, id => {
      const row = rows.find(row => row.id === id)
      if (row) select(row)
    }),
  )
})
/** Materialise the confirmed catalogue record through the authorized, idempotent importer.
 * @returns Nothing; the resulting Location ID unlocks the next hierarchy step.
 */
async function link(): Promise<void> {
  if (!selected || busy || buildingId) return
  busy = true
  failed = false
  const version = requestVersion
  try {
    const result = await importBuildingLocation({
      projectId,
      source: selected.buildingSource,
      visibility: 'exclusive',
      names: selected.names,
    })
    if (active && version === requestVersion) buildingId = result.locationId
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

<div class="flex w-full min-w-0 flex-col items-center gap-4">
  {#if loading}
    <p role="status" class="text-muted-foreground text-sm">
      {m.location_building_searching()}
    </p>
  {/if}
  {#if failed}
    <p role="alert" class="text-destructive text-sm">{m.feature_location_failed()}</p>
    <button
      type="button"
      class="text-primary text-sm underline"
      disabled={busy}
      onclick={() => retry++}
    >
      {m.location_building_retry()}
    </button>
  {/if}
  {#if rows.length}
    <p class="text-muted-foreground text-sm">
      {exact ? m.location_building_address_matches() : m.location_building_nearby()}
    </p>
    <div class="grid max-h-56 w-full gap-2 overflow-y-auto">
      {#each rows as row, index (row.id)}
        <button
          type="button"
          disabled={busy}
          aria-pressed={selected?.id === row.id}
          class="border-primary/20 hover:bg-primary/10 aria-pressed:bg-primary/10 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm"
          onclick={() => select(row)}
        >
          <span
            class="bg-primary/10 flex size-6 items-center justify-center rounded-full text-xs"
            >{index + 1}</span
          >
          <span class="min-w-0 break-words whitespace-normal"
            >{Object.values(row.names).find(Boolean) ?? row.id}</span
          >
        </button>
      {/each}
    </div>
  {:else if !loading && !failed && !buildingId}
    <p class="text-muted-foreground text-sm">{m.location_building_no_matches()}</p>
  {/if}
  {#if localName}
    <p class="font-medium">{localName}</p>
  {/if}
  {#if selected || buildingId}
    <button
      type="button"
      disabled={busy || Boolean(buildingId)}
      class="bg-primary text-primary-content rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50"
      onclick={link}
    >
      {buildingId ? m.location_building_linked() : m.location_building_link()}
    </button>
  {/if}
  <footer class="border-primary/15 mt-2 w-full space-y-2 border-t pt-4 text-center">
    <p class="text-muted-foreground text-xs">{m.location_building_missing()}</p>
    <button
      type="button"
      disabled={busy}
      class="text-primary text-sm underline underline-offset-4"
      onclick={() => (fallback = !fallback)}
    >
      {m.location_building_create_local()}
    </button>
  </footer>
  {#if fallback && address.coordinates}
    <CreateLocalLocation
      open={true}
      hideTrigger={true}
      initialKind="building"
      initialAddress={address}
      coordinates={address.coordinates}
      {projectId}
      disabled={busy}
      onCancel={() => (fallback = false)}
      onCreated={result => {
        buildingId = result.locationId
        selected = null
        localName = Object.values(result.facts.names).find(Boolean) ?? result.locationId
        onBuildingChange()
        fallback = false
      }}
    />
  {/if}
</div>
