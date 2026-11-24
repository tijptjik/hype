<script lang="ts">
// DOMAIN
import { connectionAnchor } from '../../../../src/lib/indoor/connectionEditor'
import { initialLevel, value, type IndoorData } from '../../../../src/lib/indoor/model'
import { contains } from '../../../../src/lib/indoor/navigation/geometry'
import { stationProjection, stationFill } from '../../../../src/lib/indoor/scene'
import { mapHash, validateMapBundle } from '../../../../src/lib/indoor/releases'
// TYPES
import type {
  InteriorPin,
  RecorderMap,
  MapPoint,
} from '../../../../src/lib/fieldResearch/recorder'

let {
  map,
  pin,
  units,
  locationId,
  onpick,
}: {
  map: RecorderMap
  pin: InteriorPin | null
  units: { id: string; unitId: string }[]
  locationId: string
  onpick?: (pin: InteriorPin, locationId: string) => void
} = $props()
let data = $state.raw<IndoorData>()
let failed = $state(false)
let attempt = $state(0)
let chosenFloor = $state('')
let zoom = $state(1)
let hint = $state('')
let svg = $state<SVGSVGElement>()
let mapId = $derived(map.id)
let releaseHash = $derived(map.hash)
$effect(() => {
  const id = mapId
  const hash = releaseHash
  attempt
  const controller = new AbortController()
  data = undefined
  failed = false
  chosenFloor = ''
  zoom = 1
  async function load(): Promise<void> {
    try {
      const response = await fetch(
        '/api/premises-maps/' + encodeURIComponent(id) + '/releases/' + hash,
        { signal: controller.signal },
      )
      if (!response.ok) throw new Error()
      const text = await response.text()
      if ((await mapHash(text)) !== hash) throw new Error()
      const bundle = validateMapBundle(JSON.parse(text))
      if (!controller.signal.aborted) data = bundle.data
    } catch {
      if (!controller.signal.aborted) failed = true
    }
  }
  void load()
  return () => controller.abort()
})
let projection = $derived(
  data && stationProjection(data, false, { bearing: 0, tilt: 0 }),
)
let levels = $derived(data?.level_polygon.features ?? [])
$effect(() => {
  map.unitId
  chosenFloor = ''
})
let linkedUnit = $derived(
  data?.unit_polygon.features.find(f => f.properties.unit_id === map.unitId),
)
let floorId = $derived(
  chosenFloor ||
    pin?.floorId ||
    (linkedUnit?.properties.level_id as string) ||
    (data && value(initialLevel(data).properties, 'level_id')) ||
    '',
)
let floor = $derived(levels.find(f => f.properties.level_id === floorId))
let rooms = $derived(
  data?.unit_polygon.features.filter(f => f.properties.level_id === floorId) ?? [],
)
let doors = $derived(
  data?.opening_line.features.filter(f => f.properties.level_id === floorId) ?? [],
)
let box = $derived(floor && projection ? projection.box([floor]) : [0, 0, 1, 1])
let margin = $derived(Math.max(box[2], box[3]) * 0.025 || 1)
let spot = $derived(
  pin?.floorId === floorId && projection
    ? projection.project(pin.point, floorId)
    : null,
)
let assigned = $derived(new Map(units.map(unit => [unit.unitId, unit.id])))
let selectedUnits = $derived(
  new Set(units.filter(unit => unit.id === locationId).map(unit => unit.unitId)),
)

function pick(event: MouseEvent): void {
  if (!projection || !floor || !onpick) return
  const transform = svg?.getScreenCTM()
  if (!transform) return
  const pixel = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    transform.inverse(),
  )
  const point: MapPoint = projection.unproject([pixel.x, pixel.y], floorId)
  selectPoint(point)
}
function selectPoint(point: MapPoint): void {
  if (!onpick || !floor) return
  if (!contains(point, floor)) {
    hint = 'Tap inside the floor outline.'
    return
  }
  const room = rooms.find(
    f => assigned.has(value(f.properties, 'unit_id')) && contains(point, f),
  )
  if (!room && selectedUnits.size) {
    hint = 'Tap a highlighted building part.'
    return
  }
  hint = ''
  onpick(
    { realm: 'interior', mapId: map.id, hash: map.hash, floorId, point },
    room ? assigned.get(value(room.properties, 'unit_id'))! : locationId,
  )
}
</script>

{#if failed}
  <p role="alert">Could not load this floor plan.</p>
  <button
    type="button"
    class="min-h-12 rounded-xl border border-slate-700"
    onclick={() => attempt++}
  >
    Retry floor plan
  </button>
{:else if !data || !projection || !floor}
  <div
    class="h-72 animate-pulse rounded-xl bg-slate-800"
    role="status"
    aria-label="Loading floor plan"
  ></div>
{:else}
  <label class="grid min-w-0 gap-1 text-sm text-slate-300"
    >Floor
    <select
      value={floorId}
      class="min-h-12 w-full min-w-0 rounded-xl bg-slate-900 px-3"
      onchange={event => {
        chosenFloor = event.currentTarget.value
        zoom = 1
        hint = ''
      }}
    >
      {#each levels as row (row.properties.level_id)}
        <option value={row.properties.level_id}>
          {value(row.properties, 'level_name_en') ||
            value(row.properties, 'level_name_zh') ||
            row.properties.level_id}
        </option>
      {/each}
    </select>
  </label>
  <div class="relative">
    <div class="h-[46dvh] min-h-64 overflow-auto rounded-xl bg-slate-950">
      <!-- The role becomes a keyboard-operable button when pin placement is enabled. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <svg
        bind:this={svg}
        role={onpick ? 'button' : 'img'}
        tabindex={onpick ? 0 : undefined}
        aria-label="Floor plan"
        onclick={pick}
        onkeydown={event => {
          if ((event.key === 'Enter' || event.key === ' ') && floor && projection) {
            event.preventDefault()
            const target =
              rooms.find(room =>
                selectedUnits.has(value(room.properties, 'unit_id')),
              ) ?? floor
            selectPoint(connectionAnchor(target))
          }
        }}
        viewBox={[
          box[0] - margin,
          box[1] - margin,
          box[2] + 2 * margin,
          box[3] + 2 * margin,
        ].join(' ')}
        style={'width:' +
          zoom * 100 +
          '%;height:' +
          zoom * 100 +
          '%;--station-room:#475569;--station-paid:#334155;--station-unpaid:#1e293b;--station-connector-fill:#9d8460'}
      >
        <path
          d={projection.path(floor)}
          fill="#253349"
          stroke="#94a3b8"
          vector-effect="non-scaling-stroke"
          fill-rule="evenodd"
        />
        {#each rooms as room (room.properties.unit_id)}
          {@const id = value(room.properties, 'unit_id')}
          <path
            d={projection.path(room)}
            fill={selectedUnits.has(id)
              ? '#0891b2'
              : assigned.has(id)
                ? '#0e7490'
                : stationFill(room)}
            fill-rule="evenodd"
            stroke="#a0aec0"
            stroke-width="0.8"
            vector-effect="non-scaling-stroke"
          />
        {/each}
        {#each doors as door}
          <path
            d={projection.path(door)}
            fill="none"
            stroke="#e2e8f0"
            vector-effect="non-scaling-stroke"
          />
        {/each}
        {#if spot}
          <circle
            cx={spot[0]}
            cy={spot[1]}
            r={margin * 0.8}
            fill="#f43f5e"
            stroke="white"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        {/if}
      </svg>
    </div>
    <div class="absolute right-2 bottom-2 flex gap-1">
      {#each [-1, 1] as direction}
        <button
          type="button"
          aria-label={direction < 0 ? 'Zoom out' : 'Zoom in'}
          class="size-11 rounded-lg bg-slate-800"
          disabled={direction < 0 ? zoom <= 1 : zoom >= 8}
          onclick={() => (zoom = zoom * (direction < 0 ? 0.5 : 2))}
        >
          {direction < 0 ? '−' : '+'}
        </button>
      {/each}
    </div>
  </div>
  {#if hint}
    <p role="status">{hint}</p>
  {/if}
  {#if data.source}
    <small class="text-slate-400">{data.source}</small>
  {/if}
{/if}
