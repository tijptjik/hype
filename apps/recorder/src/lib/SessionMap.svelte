<script lang="ts">
// COMPONENTS
import IndoorDrawing from './IndoorDrawing.svelte'
import ExteriorDrawing from './ExteriorDrawing.svelte'
import RealmSelector from './RealmSelector.svelte'
// DOMAIN
import {
  recorderMaps,
  type RecorderLocation,
  type RecorderMap,
  type RecorderPin,
  type RecorderRecord,
  type SpatialRealm,
} from '../../../../src/lib/fieldResearch/recorder'
let {
  places,
  selectedId,
  realm,
  pin,
  onrealm,
  onuse,
  record,
}: {
  places: RecorderLocation[]
  selectedId: string
  realm: SpatialRealm
  pin: RecorderPin | null
  onrealm: (value: SpatialRealm) => void
  onuse: (id: string, pin: RecorderPin | null) => void
  record?: RecorderRecord
} = $props()
let draftId = $state('')
let draftPin = $state<RecorderPin | null>(null)
let chosenMap = $state('')
let locations = $derived([
  ...new Map(
    places
      .flatMap(row => [row, row.building, row.premises])
      .filter(row => row !== null)
      .map(row => [row.id, row]),
  ).values(),
])
let activeId = $derived(
  record?.locationId || draftId || selectedId || places[0]?.id || '',
)
let place = $derived(
  places.find(row => row.id === activeId) ?? locations.find(row => row.id === activeId),
)
let maps = $derived(place ? recorderMaps(place) : [])
let currentPin = $derived(record ? record.pin : draftId ? draftPin : pin)
let indoorPin = $derived(currentPin?.realm === 'interior' ? currentPin : null)
let map = $derived<RecorderMap | undefined>(
  record && indoorPin
    ? { id: indoorPin.mapId, hash: indoorPin.hash, name: indoorPin.mapId, unitId: null }
    : (maps.find(row => row.id === chosenMap) ?? maps[0]),
)
let units = $derived(
  places.flatMap(p =>
    p.maps
      .filter(row => row.id === map?.id && row.unitId)
      .map(row => ({ id: p.id, unitId: row.unitId! })),
  ),
)
function choose(id: string, point: RecorderPin | null): void {
  draftId = id
  draftPin = point
  chosenMap = point?.realm === 'interior' ? point.mapId : ''
}
</script>
{#if !record}
  <RealmSelector
    value={realm}
    onchange={r => {
      if (realm !== r) {
        choose(activeId, null)
        onrealm(r)
      }
    }}
  />
  <label class="grid min-w-0 gap-1 text-sm text-slate-300"
    >Location
    <select
      class="min-h-12 w-full min-w-0 rounded-xl bg-slate-900 px-3"
      value={activeId}
      onchange={event => choose(event.currentTarget.value, null)}
    >
      {#each locations as row (row.id)}
        <option value={row.id}>{row.name}</option>
      {/each}
    </select>
  </label>
{/if}
{#if (record?.spatialRealm ?? realm) === 'interior'}
  {#if map}
    {#if !record && new Set(maps.map(row => row.id)).size > 1}
      <label class="grid min-w-0 gap-1 text-sm text-slate-300"
        >Drawing
        <select
          class="min-h-12 w-full min-w-0 rounded-xl bg-slate-900"
          value={map.id}
          onchange={event => {
            choose(activeId, null)
            chosenMap = event.currentTarget.value
          }}
        >
          {#each [
            ...new Map(maps.map(row => [row.id, row])).values(),
          ] as item (item.id)}
            <option value={item.id}>{item.name}</option>
          {/each}
        </select>
      </label>
    {/if}
    <IndoorDrawing
      {map}
      pin={indoorPin?.mapId === map.id && indoorPin.hash === map.hash
        ? indoorPin
        : null}
      {units}
      locationId={activeId}
      onpick={record ? undefined : (point, id) => choose(id, point)}
    />
  {:else}
    <p role="status">No published floor plan is linked to this location.</p>
  {/if}
{:else}
  <ExteriorDrawing
    places={record ? [] : locations}
    locationId={activeId}
    point={currentPin?.realm === 'exterior' ? currentPin.point : null}
    onpick={record
      ? undefined
      : (point, id) => choose(id, { realm: 'exterior', point })}
  />
{/if}
{#if !record}
  {#if (map && realm === 'interior') || realm === 'exterior'}
    <p class="text-sm text-slate-300">
      {currentPin ? 'Pin placed.' : 'Tap the map to place a pin.'}
    </p>
  {/if}
  <button
    type="button"
    disabled={!activeId}
    class="min-h-14 rounded-xl bg-white font-semibold text-black"
    onclick={() => onuse(activeId, currentPin)}
  >
    Use location
  </button>
{/if}
