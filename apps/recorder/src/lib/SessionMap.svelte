<script lang="ts">
// I18N
import { t } from './i18n'
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
  <label class="text-muted grid min-w-0 gap-1 text-sm"
    >{t('location')}
    <select
      data-recorder-select
      class="bg-panel min-h-12 w-full min-w-0 rounded-xl px-3"
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
      <label class="text-muted grid min-w-0 gap-1 text-sm"
        >{t('drawing')}
        <select
          data-recorder-select
          class="bg-panel min-h-12 w-full min-w-0 rounded-xl"
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
    <p role="status">{t('no_published_floor_plan_is_linked_to_this_location')}</p>
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
    <p class="text-muted text-sm">
      {currentPin ? t('pin_placed') : t('tap_the_map_to_place_a_pin')}
    </p>
  {/if}
  <button
    type="button"
    disabled={!activeId}
    class="bg-accent text-on-accent min-h-14 rounded-xl font-semibold"
    onclick={() => onuse(activeId, currentPin)}
  >
    {t('use_location')}
  </button>
{/if}
