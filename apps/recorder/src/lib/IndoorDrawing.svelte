<script lang="ts">
// SVELTE
import { prefersReducedMotion } from 'svelte/motion'
// I18N
import Selector from './Selector.svelte'
import { t } from './i18n'
// DOMAIN
import { connectionAnchor } from '../../../../src/lib/indoor/connectionEditor'
import {
  centre,
  initialLevel,
  value,
  type IndoorData,
  type IndoorFeature,
} from '../../../../src/lib/indoor/model'
import { facilitySymbol } from '../../../../src/lib/indoor/facilities'
import { polygonLabels, fitPolygonText } from '../../../../src/lib/indoor/labels'
import { reviewedTreads } from '../../../../src/lib/indoor/stairFlights'
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
const allFloors = '__all_floors__'
let exploded = $state(false)
let spread = $state(0)
let bearing = $state(0)
let tilt = $state(60)
let spacing = $state(25)
let dragOrbits = false
let animatedView = $state.raw<number[] | null>(null)
let frame = 0
let atMinimum = false
let pinchCanExplode = false
let pinchDistance = 0
let lastWheel = -Infinity
let wheelCanExplode = false
let zoom = $state(1)
let offset = $state<MapPoint>([0, 0])
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
  exploded = false
  spread = 0
  animatedView = null
  atMinimum = false
  lastWheel = -Infinity
  zoom = 1
  offset = [0, 0]
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
      if (!controller.signal.aborted) {
        data = bundle.data
        resetCamera()
      }
    } catch {
      if (!controller.signal.aborted) failed = true
    }
  }
  void load()
  return () => {
    controller.abort()
    cancelAnimationFrame(frame)
    fingers.clear()
  }
})
let projection = $derived(
  data && stationProjection(data, false, { bearing: 0, tilt: 0 }),
)
let levels = $derived(
  [...(data?.level_polygon.features ?? [])].sort(
    (a, b) => Number(a.properties.level_ordinal) - Number(b.properties.level_ordinal),
  ),
)
let stackProjection = $derived(
  data && stationProjection(data, true, { bearing, tilt, spacing }),
)
let displayedProjection = $derived(
  !spread || !data
    ? projection
    : spread === 1
      ? stackProjection
      : stationProjection(data, true, {
          bearing: (((bearing + 540) % 360) - 180) * spread,
          tilt: tilt * spread,
          spacing: spacing * spread,
        }),
)
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
let visibleFloors = $derived(exploded || spread > 0 ? levels : floor ? [floor] : [])
let roomsByFloor = $derived(byFloor(data?.unit_polygon.features ?? []))
let doorsByFloor = $derived(byFloor(data?.opening_line.features ?? []))
let rooms = $derived(roomsByFloor.get(floorId) ?? [])
let symbols = $derived(
  data?.amenity_point.features.filter(
    f =>
      f.properties.marker_role === 'unit_symbol' && f.properties.level_id === floorId,
  ) ?? [],
)
let flightTreads = $derived(
  rooms
    .filter(room => room.properties.stair_flights)
    .flatMap(room => reviewedTreads(room) ?? []),
)
let box = $derived(
  exploded && stackProjection && levels.length
    ? stackProjection.box(levels)
    : floor && projection
      ? projection.box([floor])
      : [0, 0, 1, 1],
)
let margin = $derived(Math.max(box[2], box[3]) * 0.025 || 1)
let spot = $derived(
  pin?.point && projection ? projection.project(pin.point, pin.floorId) : null,
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

const fingers = new Map<number, MapPoint>()
let travelled = false
let origin: MapPoint = [0, 0]
const camera = $derived([
  box[0] + box[2] / 2 + offset[0],
  box[1] + box[3] / 2 + offset[1],
])
const width = $derived((box[2] + 2 * margin) / zoom)
const height = $derived((box[3] + 2 * margin) / zoom)
const view = $derived(
  animatedView ?? [camera[0] - width / 2, camera[1] - height / 2, width, height],
)

/** Transform cached flat paths together so every floor stays registered throughout the transition. */
function floorTransform(id: string): string | undefined {
  if (!spread || !projection || !displayedProjection) return
  const project = (point: MapPoint): MapPoint =>
    displayedProjection!.project(projection!.unproject(point, id), id)
  const [x, y] = project([0, 0])
  const [ax, ay] = project([1, 0])
  const [bx, by] = project([0, 1])
  return `matrix(${ax - x} ${ay - y} ${bx - x} ${by - y} ${x} ${y})`
}

/** Fit the destination while moving the selected floor to its projected stack position. */
function showView(next: string): void {
  if (!floor || !projection || !stackProjection) return
  const all = next === allFloors
  const target = all ? floor : levels.find(f => f.properties.level_id === next)
  if (!target) return
  const source = [...view]
  const start = spread
  const end = all ? 1 : 0
  cancelAnimationFrame(frame)
  exploded = all
  if (!all) chosenFloor = next
  atMinimum = false
  zoom = 1
  offset = [0, 0]
  if (prefersReducedMotion.current || start === end) {
    spread = end
    animatedView = null
    return
  }
  const [x, y, w, h] = all ? stackProjection.box(levels) : projection.box([target])
  const pad = Math.max(w, h) * 0.025 || 1
  const destination = [x - pad, y - pad, w + 2 * pad, h + 2 * pad]
  animatedView = source
  const began = performance.now()
  const step = (now: number): void => {
    const t = Math.min(1, (now - began) / 500)
    const ease = t * t * (3 - 2 * t)
    spread = start + (end - start) * ease
    animatedView =
      t === 1 ? null : source.map((v, i) => v + (destination[i] - v) * ease)
    if (t < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

/** A continuous pinch or wheel burst can reach the fitted floor only once. */
function applyZoom(ratio: number, canExplode: boolean): boolean {
  if (ratio < 1 && !exploded && levels.length > 1 && zoom === 1 && canExplode) {
    showView(allFloors)
    return true
  }
  zoom = Math.min(16, Math.max(1, zoom * ratio))
  if (ratio !== 1) atMinimum = zoom === 1 && ratio < 1
  return false
}

function resetCamera(): void {
  bearing = data?.coordinateSpace === 'image-pixels' ? 0 : 245
  tilt = 60
  spacing = 25
  zoom = 1
  offset = [0, 0]
}

function orbit(horizontal: number, vertical: number): void {
  bearing = (((bearing + horizontal) % 360) + 360) % 360
  tilt = Math.max(0, Math.min(75, tilt + vertical))
}

function wheelZoom(event: WheelEvent): void {
  if (!event.deltaY) return
  event.preventDefault()
  const now = performance.now()
  if (now - lastWheel > 220) wheelCanExplode = atMinimum && zoom === 1
  lastWheel = now
  if (animatedView) return
  if (exploded && event.altKey) {
    if (event.ctrlKey) orbit(0, -event.deltaY * 0.08)
    else orbit(event.deltaY * 0.12, 0)
    return
  }
  applyZoom(
    Math.exp(-Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY) * 0.004, 1)),
    wheelCanExplode,
  )
  if (zoom > 1) wheelCanExplode = false
}

$effect(() => {
  const element = svg
  element?.addEventListener('wheel', wheelZoom, { passive: false })
  return () => element?.removeEventListener('wheel', wheelZoom)
})

function local(x: number, y: number): MapPoint {
  const pt = new DOMPoint(x, y).matrixTransform(svg!.getScreenCTM()!.inverse())
  return [pt.x, pt.y]
}
function down(event: PointerEvent): void {
  if ((event.button !== 0 && !(exploded && event.button === 1)) || animatedView) return
  const point: MapPoint = [event.clientX, event.clientY]
  if (!fingers.size) {
    dragOrbits = exploded && event.button === 0 && !event.shiftKey
    if (event.button === 1) event.preventDefault()
    origin = point
    travelled = false
  } else if (fingers.size === 1) {
    dragOrbits = false
    pinchCanExplode = atMinimum && zoom === 1
    const first = fingers.values().next().value!
    pinchDistance = Math.hypot(first[0] - point[0], first[1] - point[1])
    travelled = true
  }
  fingers.set(event.pointerId, point)
  svg?.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent): void {
  const prev = fingers.get(event.pointerId)
  if (!prev || animatedView || !svg?.getScreenCTM()) return
  const next: MapPoint = [event.clientX, event.clientY]
  const other = [...fingers].find(([id]) => id !== event.pointerId)?.[1]
  fingers.set(event.pointerId, next)
  if (!travelled && Math.hypot(next[0] - origin[0], next[1] - origin[1]) < 5) return
  travelled = true
  if (dragOrbits && !other) {
    orbit((next[0] - prev[0]) * 0.4, (prev[1] - next[1]) * 0.3)
    return
  }
  const from = other
    ? local((prev[0] + other[0]) / 2, (prev[1] + other[1]) / 2)
    : local(...prev)
  const to = other
    ? local((next[0] + other[0]) / 2, (next[1] + other[1]) / 2)
    : local(...next)
  const ratio = other
    ? Math.hypot(next[0] - other[0], next[1] - other[1]) /
      Math.max(1, Math.hypot(prev[0] - other[0], prev[1] - other[1]))
    : 1
  if (exploded && other) {
    const startAngle = Math.atan2(prev[1] - other[1], prev[0] - other[0])
    const endAngle = Math.atan2(next[1] - other[1], next[0] - other[0])
    orbit(((endAngle - startAngle) * 180) / Math.PI, 0)
  }
  const previousZoom = zoom
  const minimumGesture =
    other && Math.hypot(next[0] - other[0], next[1] - other[1]) < pinchDistance * 0.94
  if (applyZoom(ratio, Boolean(pinchCanExplode && minimumGesture))) return
  if (zoom > 1) pinchCanExplode = false
  const scale = zoom
  offset = [
    offset[0] + from[0] - camera[0] - ((to[0] - camera[0]) * previousZoom) / scale,
    offset[1] + from[1] - camera[1] - ((to[1] - camera[1]) * previousZoom) / scale,
  ]
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
function up(event: PointerEvent): void {
  if (!fingers.delete(event.pointerId) || travelled || !projection) return
  const client: MapPoint = [event.clientX, event.clientY]
  const position = local(...client)
  if (animatedView) return
  if (exploded && displayedProjection) {
    const level = levels.findLast(f => {
      const id = value(f.properties, 'level_id')
      return contains(displayedProjection!.unproject(position, id), f)
    })
    if (level) showView(value(level.properties, 'level_id'))
  } else if (floor) selectPoint(projection.unproject(position, floorId), floor)
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
  <div class="relative">
    <div class="bg-canvas relative h-[46dvh] min-h-64 overflow-hidden rounded-xl">
      <!-- The role becomes a keyboard-operable button when pin placement is enabled. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <svg
        bind:this={svg}
        role={onpick ? 'button' : 'img'}
        tabindex={onpick ? 0 : undefined}
        aria-label={t('floor_plan')}
        class="absolute inset-0 size-full touch-none select-none"
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={event => {
          fingers.delete(event.pointerId)
          travelled = true
        }}
        onkeydown={event => {
          if (
            (event.key === 'Enter' || event.key === ' ') &&
            floor &&
            projection &&
            !exploded &&
            !animatedView
          ) {
            event.preventDefault()
            const target =
              rooms.find(room =>
                selectedUnits.has(value(room.properties, 'unit_id')),
              ) ?? floor
            selectPoint(connectionAnchor(target), floor)
          }
        }}
        viewBox={view.join(' ')}
      >
        {#each visibleFloors as level (level.properties.level_id)}
          {@const id = value(level.properties, 'level_id')}
          {@const transform = imageTransform(level)}
          <g
            data-level={id}
            transform={floorTransform(id)}
            opacity={id === floorId ? 1 : spread}
          >
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
            {#if projection && id === floorId && !exploded && spread === 0}
              {@const camera = projection}
              <g
                pointer-events="none"
                fill="var(--station-ink)"
                text-anchor="middle"
                dominant-baseline="central"
              >
                {#each flightTreads as tread}
                  <path
                    d={camera.path(tread)}
                    stroke="var(--station-connector)"
                    stroke-width="0.6"
                    vector-effect="non-scaling-stroke"
                  />
                {/each}
                {#each flightTreads.filter(
                  tread => tread.properties.flight_label,
                ) as tread}
                  {@const p = camera.project(centre(tread), id)}
                  <text
                    x={p[0]}
                    y={p[1]}
                    font-size={margin * 0.85}
                    paint-order="stroke"
                    stroke="var(--station-paper)"
                    stroke-width={margin * 0.2}
                  >
                    {tread.properties.flight_label}
                  </text>
                {/each}
                {#each rooms.filter(
                  room =>
                    room.properties.unit_address_en &&
                    room.properties.unit_unitnumbername,
                ) as room}
                  {@const text = value(room.properties, 'unit_unitnumbername')}
                  {#each polygonLabels(room, point =>
                    camera.project(point, id),
                  ) as anchor}
                    {@const label = fitPolygonText(
                      anchor,
                      margin * 1.2,
                      text.length,
                      1,
                    )}
                    <text x={label.point[0]} y={label.point[1]} font-size={label.size}>
                      <title>{room.properties.unit_address_en}</title>
                      {text}
                    </text>
                  {/each}
                {/each}
                {#each symbols as marker}
                  {@const p = camera.project(centre(marker), id)}
                  {@const icon = facilitySymbol(
                    value(marker.properties, 'amenity_category'),
                  )}
                  <g transform={`translate(${p[0]} ${p[1]}) scale(${margin / 14})`}>
                    <title>{marker.properties.amenity_name_en}</title>
                    <circle r="13" fill={icon.background} stroke={icon.color} />
                    <path
                      d={icon.path}
                      transform="translate(-10 -10) scale(0.8333)"
                      fill="none"
                      stroke={icon.color}
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </g>
                {/each}
              </g>
            {/if}
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
      {#if exploded}
        <button
          type="button"
          class="bg-surface h-11 rounded-lg px-2 text-sm"
          disabled={Boolean(animatedView)}
          onclick={resetCamera}
        >
          {t('stack_reset')}
        </button>
      {/if}
      {#each [-1, 1] as direction}
        <button
          type="button"
          aria-label={direction < 0 ? t('zoom_out') : t('zoom_in')}
          class="bg-surface size-11 rounded-lg"
          disabled={Boolean(animatedView) ||
            (direction < 0 ? zoom <= 1 && (exploded || levels.length < 2) : zoom >= 16)}
          onclick={() => applyZoom(direction < 0 ? 0.5 : 2, atMinimum)}
        >
          {direction < 0 ? '−' : '+'}
        </button>
      {/each}
    </div>
  </div>
  {#if exploded}
    <fieldset class="grid grid-cols-3 gap-x-3" disabled={Boolean(animatedView)}>
      <legend class="sr-only">{t('stack_camera')}</legend>
      <label class="grid min-w-0 text-xs">
        {t('stack_rotation')}
        <input
          aria-label={t('stack_rotation')}
          type="range"
          min="0"
          max="359"
          step="1"
          class="accent-accent h-8 w-full"
          bind:value={bearing}
        >
      </label>
      <label class="grid min-w-0 text-xs">
        {t('stack_tilt')}
        <input
          aria-label={t('stack_tilt')}
          type="range"
          min="0"
          max="75"
          step="1"
          class="accent-accent h-8 w-full"
          bind:value={tilt}
        >
      </label>
      <label class="grid min-w-0 text-xs">
        {t('stack_spacing')}
        <input
          aria-label={t('stack_spacing')}
          type="range"
          min="10"
          max="65"
          step="1"
          class="accent-accent h-8 w-full"
          bind:value={spacing}
        >
      </label>
    </fieldset>
  {/if}
  {#if exploded}
    <p class="text-muted text-xs">{t('plan_stack_help')}</p>
  {/if}
  <Selector
    label={t('floor')}
    value={exploded ? allFloors : floorId}
    wheel
    options={[
      ...(levels.length > 1 ? [{ id: allFloors, name: t('all_floors') }] : []),
      ...levels.map(row => ({
        id: value(row.properties, 'level_id'),
        name:
          value(row.properties, 'level_name_en') ||
          value(row.properties, 'level_name_zh') ||
          value(row.properties, 'level_id'),
      })),
    ]}
    onchange={showView}
  />
  {#if hint}
    <p role="status">{hint}</p>
  {/if}
  {#if data.source}
    <small class="text-muted">{data.source}</small>
  {/if}
{/if}
