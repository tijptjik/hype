<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { t } from './i18n'
// COMPONENTS
import Selector from './Selector.svelte'
import BuildingModel from './BuildingModel.svelte'
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
  saving,
  canCapture,
  onuse,
  oncancel,
  record,
}: {
  places: RecorderLocation[]
  selectedId: string
  realm: SpatialRealm | null
  pin: RecorderPin | null
  saving: boolean
  canCapture: boolean
  onuse: (id: string, realm: SpatialRealm | null, pin: RecorderPin | null) => void
  oncancel: () => void
  record?: RecorderRecord
} = $props()
let id = $state(untrack(() => record?.locationId ?? selectedId))
let draftRealm = $state(untrack(() => (record ? record.spatialRealm : realm)))
let marker = $state<RecorderPin | null>(untrack(() => (record ? record.pin : pin)))
let selectedMap = $state('')
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
let buildings = $derived(
  [
    ...new Map(
      places.map(row => {
        const owner =
          row.kind === 'building' ? row : (row.building ?? row.premises ?? row)
        return [owner.id, owner] as const
      }),
    ).values(),
  ].sort(
    (a, b) =>
      Number(!a.address) - Number(!b.address) ||
      collator.compare(
        a.addressSortKey || a.address || '',
        b.addressSortKey || b.address || '',
      ) ||
      collator.compare(a.address || '', b.address || '') ||
      collator.compare(a.name, b.name),
  ),
)
let assigned = $derived(places.find(row => row.id === id))
let parent = $derived(
  buildings.find(
    row => row.id === id || row.id === (assigned?.building ?? assigned?.premises)?.id,
  ),
)
let parts = $derived(
  places.filter(
    row =>
      row.kind === 'building_part' && (row.building ?? row.premises)?.id === parent?.id,
  ),
)
let indoor = $derived(marker?.realm === 'interior' ? marker : null)
let mapOptions = $derived([
  ...new Map(
    [
      ...parts.flatMap(recorderMaps),
      ...(parent ? recorderMaps(parent) : []),
      ...(assigned ? assigned.maps : []),
    ].map(row => [row.id, row]),
  ).values(),
])
let map = $derived<RecorderMap | undefined>(
  record && indoor
    ? { id: indoor.mapId, hash: indoor.hash, name: indoor.mapId, unitId: null }
    : (mapOptions.find(row => row.id === (selectedMap || indoor?.mapId)) ??
        mapOptions[0]),
)
let units = $derived(
  parts.flatMap(row =>
    row.maps
      .filter(link => link.id === map?.id && link.unitId)
      .map(link => ({ id: row.id, unitId: link.unitId!, name: row.name })),
  ),
)
let activeTitle = $derived(
  indoor?.unitLabel ||
    (assigned?.kind === 'building_part' ? assigned.name : '') ||
    parent?.address ||
    parent?.name,
)
let facade = $derived(
  marker?.realm === 'exterior' && 'surface' in marker ? marker : null,
)
function chooseOwner(next: string): void {
  id = next
  selectedMap = ''
  draftRealm = null
  marker = null
}
function changeRealm(next: SpatialRealm): void {
  if (draftRealm === next) return
  draftRealm = next
  id = parent?.id ?? id
  marker = null
}
</script>

<div inert={saving} class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
  {#if !record}
    <Selector
      label={t('building')}
      showLabel={false}
      icon="building"
      options={buildings}
      value={parent?.id ?? ''}
      onchange={chooseOwner}
      searchable
    />
    <RealmSelector value={draftRealm} disabled={!parent} onchange={changeRealm} />
  {:else}
    <h2 class="text-xl font-semibold">{record.title || t('location_map')}</h2>
  {/if}
  {#if draftRealm === 'interior'}
    {#if map}
      {#if mapOptions.length > 1 && !record}
        <Selector
          label={t('drawing')}
          icon="layer"
          options={mapOptions}
          value={map.id}
          onchange={next => {
            selectedMap = next
            marker = null
            id = parent?.id ?? id
          }}
        />
      {/if}
      {#if activeTitle}
        <h3 aria-live="polite" class="font-semibold">{activeTitle}</h3>
      {/if}
      {#key map.id + map.hash}
        <IndoorDrawing
          {map}
          pin={indoor}
          {units}
          locationId={id}
          buildingId={parent?.id || id}
          onpick={record
            ? undefined
            : (point, next) => {
                marker = point
                id = next
              }}
        />
      {/key}
    {:else}
      <p class="text-muted" role="status">
        {t('no_published_floor_plan_is_linked_to_this_location')}
      </p>
      {#if !record && parts.length}
        <Selector
          label={t('building_part')}
          icon="building_part"
          options={parts}
          value={id}
          onchange={next => {
            id = next
            marker = null
          }}
        />
      {/if}
    {/if}
  {:else if draftRealm === 'exterior'}
    {#if record && marker?.realm === 'exterior' && 'point' in marker}
      <ExteriorDrawing places={[]} locationId={id} point={marker.point} />
    {:else if parent?.exteriorUrl}
      {#key parent.exteriorUrl}
        <BuildingModel
          url={parent.exteriorUrl}
          pin={facade}
          readonly={!!record}
          onpick={point => {
            marker = point
          }}
        />
      {/key}
    {:else}
      <p role="status" class="text-muted">{t('no_linked_building_model')}</p>
    {/if}
  {/if}
</div>
<footer
  class="border-line bg-canvas mt-auto flex gap-2 border-t py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
>
  <button
    type="button"
    class="border-line min-h-12 flex-1 rounded-xl border"
    disabled={saving}
    onclick={oncancel}
  >
    {record ? t('close') : t('cancel')}
  </button>
  {#if !record}
    <button
      type="button"
      disabled={!id || saving || !canCapture}
      aria-busy={saving}
      class="bg-accent text-on-accent min-h-12 flex-1 rounded-xl font-semibold disabled:opacity-40"
      onclick={() => onuse(id, draftRealm, marker)}
    >
      {t('accept')}
    </button>
  {/if}
</footer>
