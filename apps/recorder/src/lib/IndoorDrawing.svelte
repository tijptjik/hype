<script lang="ts">
// I18N
import { t } from './i18n'
// DOMAIN
import { connectionAnchor } from '../../../../src/lib/indoor/connectionEditor'
import {
  initialLevel,
  value,
  type IndoorData,
  type IndoorFeature,
} from '../../../../src/lib/indoor/model'
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
let stacked = $state(true)
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
  hint = ''
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
  data &&
    stationProjection(
      data,
      stacked,
      stacked ? { bearing: 25, tilt: 50 } : { bearing: 0, tilt: 0 },
    ),
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
let visibleFloors = $derived(
  stacked
    ? [...levels].sort(
        (a, b) =>
          Number(a.properties.level_ordinal) - Number(b.properties.level_ordinal),
      )
    : floor
      ? [floor]
      : [],
)
let roomsByFloor = $derived(byFloor(data?.unit_polygon.features ?? []))
let doorsByFloor = $derived(byFloor(data?.opening_line.features ?? []))
let rooms = $derived(roomsByFloor.get(floorId) ?? [])
let box = $derived(floor && projection ? projection.box(visibleFloors) : [0, 0, 1, 1])
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

/** Index drawable features once per release for the floor stack.
 * @param features Source units or openings. @returns Features keyed by floor.
 */
function byFloor(features: IndoorFeature[]): Map<string, IndoorFeature[]> {
  const groups = new Map<string, IndoorFeature[]>()
  for (const feature of features) {
    const key = value(feature.properties, 'level_id')
    const group = groups.get(key)
    if (group) group.push(feature)
    else groups.set(key, [feature])
  }
  return groups
}

/** Fit the retained reference image to its floor in the current camera projection.
 * @param level Published floor geometry and image dimensions. @returns SVG image transform.
 */
function imageTransform(level: IndoorFeature): string | undefined {
  if (!projection || data?.coordinateSpace !== 'image-pixels') return
  const width = Number(level.properties.image_width)
  const height = Number(level.properties.image_height)
  if (!(width > 0 && height > 0 && level.properties.image_url)) return
  const id = value(level.properties, 'level_id')
  const [x, y] = projection.project([0, 0], id)
  const right = projection.project([width, 0], id)
  const bottom = projection.project([0, height], id)
  return `matrix(${right[0] - x} ${right[1] - y} ${bottom[0] - x} ${bottom[1] - y} ${x} ${y})`
}

function pick(event: MouseEvent): void {
  if (!projection || !floor || !onpick) return
  const transform = svg?.getScreenCTM()
  if (!transform) return
  const pixel = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    transform.inverse(),
  )
  const id =
    (event.target as Element).closest('[data-level]')?.getAttribute('data-level') ??
    floorId
  const level = levels.find(f => f.properties.level_id === id)
  if (level) selectPoint(projection.unproject([pixel.x, pixel.y], id), level)
}
function selectPoint(point: MapPoint, level: IndoorFeature): void {
  if (!onpick) return
  const id = value(level.properties, 'level_id')
  if (!contains(point, level)) {
    hint = t('tap_inside_the_floor_outline')
    return
  }
  const room = roomsByFloor
    .get(id)
    ?.find(f => assigned.has(value(f.properties, 'unit_id')) && contains(point, f))
  if (!room && selectedUnits.size) {
    hint = t('tap_a_highlighted_building_part')
    return
  }
  hint = ''
  chosenFloor = id
  onpick(
    { realm: 'interior', mapId: map.id, hash: map.hash, floorId: id, point },
    room ? assigned.get(value(room.properties, 'unit_id'))! : locationId,
  )
}
</script>

{#if failed}
  <p role="alert">{t('could_not_load_this_floor_plan')}</p>
  <button
    type="button"
    class="border-line min-h-12 rounded-xl border"
    onclick={() => attempt++}
  >
    {t('retry_floor_plan')}
  </button>
{:else if !data || !projection || !floor}
  <div
    class="bg-surface h-72 animate-pulse rounded-xl"
    role="status"
    aria-label={t('loading_floor_plan')}
  ></div>
{:else}
  <label class="text-muted grid min-w-0 gap-1 text-sm"
    >{t('floor')}
    <select
      data-recorder-select
      value={floorId}
      class="bg-panel min-h-12 w-full min-w-0 rounded-xl px-3 pr-11"
      onchange={event => {
        chosenFloor = event.currentTarget.value
        stacked = false
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
    <div class="bg-canvas h-[46dvh] min-h-64 overflow-auto rounded-xl">
      <!-- The role becomes a keyboard-operable button when pin placement is enabled. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <svg
        bind:this={svg}
        role={onpick ? 'button' : 'img'}
        tabindex={onpick ? 0 : undefined}
        aria-label={t('floor_plan')}
        onclick={pick}
        onkeydown={event => {
          if ((event.key === 'Enter' || event.key === ' ') && floor && projection) {
            event.preventDefault()
            const target =
              rooms.find(room =>
                selectedUnits.has(value(room.properties, 'unit_id')),
              ) ?? floor
            selectPoint(connectionAnchor(target), floor)
          }
        }}
        viewBox={[
          box[0] - margin,
          box[1] - margin,
          box[2] + 2 * margin,
          box[3] + 2 * margin,
        ].join(' ')}
        style={'width:' + zoom * 100 + '%;height:' + zoom * 100 + '%'}
      >
        {#each visibleFloors as level (level.properties.level_id)}
          {@const id = value(level.properties, 'level_id')}
          {@const transform = imageTransform(level)}
          <g data-level={id} opacity={id === floorId ? 1 : 0.75}>
            <path
              d={projection.path(level)}
              fill="var(--station-paper)"
              stroke="var(--station-edge)"
              vector-effect="non-scaling-stroke"
              fill-rule="evenodd"
            />
            {#if transform}
              <image
                href={value(level.properties, 'image_url')}
                width="1"
                height="1"
                {transform}
                preserveAspectRatio="none"
                pointer-events="none"
              />
            {/if}
            {#each roomsByFloor.get(id) ?? [] as room (room.properties.unit_id)}
              {@const id = value(room.properties, 'unit_id')}
              <path
                d={projection.path(room)}
                fill={selectedUnits.has(id)
                  ? 'var(--station-accent)'
                  : assigned.has(id)
                    ? 'var(--station-connector)'
                    : stationFill(room)}
                fill-rule="evenodd"
                stroke="var(--station-edge)"
                fill-opacity={transform ? (selectedUnits.has(id) ? 0.45 : 0.12) : 1}
                stroke-width="0.8"
                vector-effect="non-scaling-stroke"
              />
            {/each}
            {#each doorsByFloor.get(id) ?? [] as door}
              <path
                d={projection.path(door)}
                fill="none"
                stroke="var(--station-ink)"
                vector-effect="non-scaling-stroke"
              />
            {/each}
            {#if spot && id === pin?.floorId}
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
          </g>
        {/each}
      </svg>
    </div>
    <div class="absolute right-2 bottom-2 flex gap-1">
      <button
        type="button"
        aria-label={t('floor_stack')}
        aria-pressed={stacked}
        class="bg-surface aria-pressed:bg-accent aria-pressed:text-on-accent min-h-11 rounded-lg px-3 font-semibold"
        onclick={() => {
          stacked = !stacked
          zoom = 1
        }}
      >
        3D
      </button>
      {#each [-1, 1] as direction}
        <button
          type="button"
          aria-label={direction < 0 ? t('zoom_out') : t('zoom_in')}
          class="bg-surface size-11 rounded-lg"
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
    <small class="text-muted">{data.source}</small>
  {/if}
{/if}
