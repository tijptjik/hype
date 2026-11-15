<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// DATA
import {
  centre,
  value,
  type IndoorData,
  type IndoorFeature,
} from '#lib/indoor/model.js'
import IndoorFloorLayer from './IndoorFloorLayer.svelte'
import { shopArtwork } from '#lib/indoor/artwork.js'
import { stationProjection } from '#lib/indoor/scene.js'
import { connectionCandidates, stairTreads } from '#lib/indoor/spatial.js'
import type { StationState } from '#lib/indoor/station.svelte.js'
let {
  station,
  data,
  onSelect,
}: { station: StationState; data: IndoorData; onSelect: () => void } = $props()
const projection = $derived(
  stationProjection(data, station.exploded, {
    bearing: station.bearing,
    tilt: station.exploded ? station.tilt : station.planTilt,
    spacing: station.spacing,
  }),
)
const levels = $derived(
  data.level_polygon.features
    .filter(
      f =>
        (station.exploded || f.properties.level_id === station.floor) &&
        (station.arrival < 1 ||
          f.properties.level_id === station.route?.points.at(-1)?.level),
    )
    .toSorted(
      (a, b) => Number(a.properties.level_ordinal) - Number(b.properties.level_ordinal),
    ),
)
const connections = $derived(
  connectionCandidates(data).filter(
    c => station.showInferred || c.evidence !== 'aligned-footprints',
  ),
)
const treads = $derived(stairTreads(data).features)
const shops = $derived(
  new Map(station.entries.filter(p => p.kind === 'shop').map(p => [p.id, p])),
)
const brand = (feature: IndoorFeature) =>
  shopArtwork(shops.get(value(feature.properties, 'unit_id')))

const isBrand = (f: IndoorFeature) => Boolean(brand(f))
const focused = $derived(
  station.selected?.kind === 'shop' ? [station.selected.feature] : levels,
)
const box = $derived(projection.box(focused))
const baseView = $derived([box[0] - 18, box[1] - 24, box[2] + 36, box[3] + 48])
let zoom = $state(1),
  panX = $state(0),
  panY = $state(0)
let svg: SVGSVGElement
let width = $state(800),
  height = $state(600)
let drag: {
  x: number
  y: number
  px: number
  py: number
  bearing: number
  tilt: number
  rotate: boolean
  tiltOnly: boolean
  moved: boolean
} | null = null
let dragged = $state(false)
const pointers = new Map<number, { x: number; y: number }>()
let pinch: {
  distance: number
  angle: number
  zoom: number
  bearing: number
  x: number
  y: number
  px: number
  py: number
  scale: number
} | null = null
function updateTilt(value: number): void {
  const tilt = Math.max(0, Math.min(75, value))
  if (station.exploded) station.tilt = tilt
  else station.planTilt = tilt
}
function releasePointer(event: PointerEvent): void {
  pointers.delete(event.pointerId)
  if (pinch) dragged = true
  else dragged = drag?.moved ?? dragged
  pinch = null
  drag = null
}
$effect(() => {
  void station.fitRevision
  void station.exploded
  untrack(() => {
    zoom = 1
    panX = 0
    panY = 0
  })
})
const manualViewBox = $derived(
  `${baseView[0] + (baseView[2] * (1 - 1 / zoom)) / 2 + panX} ${baseView[1] + (baseView[3] * (1 - 1 / zoom)) / 2 + panY} ${baseView[2] / zoom} ${baseView[3] / zoom}`,
)
// Route camera uses a fixed metre scale so increasing floor spacing does not zoom everything out.
const routeSegments = $derived(
  station.route?.points.slice(1).map((b, i) => {
    const a = station.route?.points[i] ?? b
    return {
      a,
      b,
      length: Math.max(
        0.01,
        Math.hypot(
          (b.point[0] - a.point[0]) * 103000,
          (b.point[1] - a.point[1]) * 111320,
          a.level === b.level ? 0 : 12,
        ),
      ),
    }
  }) ?? [],
)
const routeLength = $derived(routeSegments.reduce((sum, s) => sum + s.length, 0))
const traveller = $derived.by(() => {
  let remaining = station.routeProgress * routeLength
  for (const segment of routeSegments) {
    if (remaining <= segment.length || segment === routeSegments.at(-1)) {
      const t = Math.min(1, remaining / segment.length),
        a = projection.project(segment.a.point, segment.a.level),
        b = projection.project(segment.b.point, segment.b.level)
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    remaining -= segment.length
  }
  return null
})
const viewBox = $derived.by(() => {
  if (!traveller || (station.routeProgress === 0 && station.routeMode !== 'flying'))
    return manualViewBox
  const span = (130 - 45 * Math.min(1, station.routeProgress * 3)) / zoom
  const h = (span * height) / Math.max(1, width)
  return `${traveller[0] - span / 2 + panX} ${traveller[1] - h / 2 + panY} ${span} ${h}`
})
$effect(() => {
  if (station.routeMode !== 'flying' || !station.route) return
  let frame = 0,
    start = 0
  const total = routeLength
  let walked = 0,
    reachedFloor = 1
  for (const segment of routeSegments) {
    walked += segment.length
    if (segment.b.level === station.route.points.at(-1)?.level) {
      reachedFloor = walked / total
      break
    }
  }
  const animate = (time: number): void => {
    if (!start) start = time
    const progress = Math.min(1, (time - start) / 18000)
    station.routeProgress = progress
    const spread = Math.max(
      0,
      Math.min(1, (progress - reachedFloor) / Math.max(0.1, 1 - reachedFloor)),
    )
    station.arrival = spread * spread * (3 - 2 * spread)
    station.spacing = 25 + 180 * station.arrival
    station.bearing = -115 - 25 * Math.sin((progress * Math.PI) / 2)
    station.tilt = 60 - 15 * progress
    if (progress < 1) frame = requestAnimationFrame(animate)
    else {
      station.arrival = 1
      station.routeMode = 'arrived'
      station.floor = station.route?.points.at(-1)?.level ?? station.floor
      station.planTilt = 45
      station.exploded = false
    }
  }
  frame = requestAnimationFrame(animate)
  return () => cancelAnimationFrame(frame)
})
const viewport = $derived(viewBox.split(' ').map(Number))
const textScale = $derived(Math.max(viewport[2] / width, viewport[3] / height))
const maskId = $props.id()
function wheel(event: WheelEvent): void {
  event.preventDefault()
  station.stopFly()
  if (event.altKey && event.ctrlKey)
    updateTilt(
      (station.exploded ? station.tilt : station.planTilt) - event.deltaY * 0.08,
    )
  else if (event.altKey) station.bearing += event.deltaY * 0.12
  else zoom = Math.max(0.7, Math.min(12, zoom * Math.exp(-event.deltaY * 0.001)))
}
function move(event: PointerEvent): void {
  if (pointers.has(event.pointerId))
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    zoom = Math.max(
      0.7,
      Math.min(12, (pinch.zoom * Math.hypot(b.x - a.x, b.y - a.y)) / pinch.distance),
    )
    station.bearing =
      pinch.bearing + ((Math.atan2(b.y - a.y, b.x - a.x) - pinch.angle) * 180) / Math.PI
    panX = pinch.px - ((a.x + b.x) / 2 - pinch.x) * pinch.scale
    panY = pinch.py - ((a.y + b.y) / 2 - pinch.y) * pinch.scale
    dragged = true
    return
  }
  if (!drag) return
  const scale = Math.max(viewport[2] / svg.clientWidth, viewport[3] / svg.clientHeight)
  if (drag.rotate || drag.tiltOnly) {
    if (!drag.tiltOnly) station.bearing = drag.bearing + (event.clientX - drag.x) * 0.4
    updateTilt(drag.tilt - (event.clientY - drag.y) * 0.3)
  } else {
    panX = drag.px - (event.clientX - drag.x) * scale
    panY = drag.py - (event.clientY - drag.y) * scale
  }
  drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4
  if (drag.moved) svg.setPointerCapture(event.pointerId)
}
function activate(event: MouseEvent, feature: IndoorFeature): void {
  event.stopPropagation()
  if (dragged) return
  if (station.exploded) {
    station.openFloor(value(feature.properties, 'level_id'))
    return
  }
  const unit = value(feature.properties, 'unit_id')
  const place = station.entries.find(
    p => p.id === unit || p.feature.properties.unit_id === unit,
  )
  if (place) {
    station.select(place)
    onSelect()
  }
}
function chooseFloor(id: string): void {
  station.openFloor(id)
}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (This keyboard map application provides zoom controls and equivalent panel selection.) -->
<div
  class="focus-visible:ring-primary h-full w-full outline-none focus-visible:ring-1"
  role="application"
  aria-label="Station plan controls"
  /* biome-ignore lint/a11y/noNoninteractiveTabindex: this map application owns keyboard zoom. */
  tabindex="0"
  onkeydown={e => {
    station.stopFly()
    if (e.key === '+' || e.key === '=') zoom = Math.min(12, zoom * 1.3)
    if (e.key === '-') zoom = Math.max(0.7, zoom / 1.3)
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      station.bearing -= 10
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      station.bearing += 10
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      updateTilt((station.exploded ? station.tilt : station.planTilt) + 5)
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      updateTilt((station.exploded ? station.tilt : station.planTilt) - 5)
    }
    if (e.key === '0') {
      zoom = 1
      panX = 0
      panY = 0
    }
  }}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions (Pointer gestures belong to the map; keyboard zoom is on its application wrapper.) -->
  <svg
    bind:this={svg}
    bind:clientWidth={width}
    bind:clientHeight={height}
    {viewBox}
    class="h-full w-full touch-none outline-none select-none"
    data-station-scene={station.exploded ? 'exploded' : 'plan'}
    role="application"
    aria-label={station.exploded
      ? 'Exploded station levels. Select a floor to open its plan.'
      : 'Station floor plan. Drag to pan, scroll to zoom.'}
    oncontextmenu={e => e.preventDefault()}
    onwheel={wheel}
    data-route-mode={station.routeMode}
    data-route-progress={station.routeProgress}
    data-bearing={station.bearing}
    data-tilt={station.tilt}
    onpointerdown={e => {
      if (e.button !== 0 && e.button !== 2) return
      station.stopFly()
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = {
          distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
          angle: Math.atan2(b.y - a.y, b.x - a.x),
          zoom,
          bearing: station.bearing,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          px: panX,
          py: panY,
          scale: Math.max(
            viewport[2] / svg.clientWidth,
            viewport[3] / svg.clientHeight,
          ),
        }
        drag = null
        dragged = true
        for (const id of pointers.keys()) svg.setPointerCapture(id)
        return
      }
      dragged = false
      drag = {
        x: e.clientX,
        y: e.clientY,
        px: panX,
        py: panY,
        bearing: station.bearing,
        tilt: station.exploded ? station.tilt : station.planTilt,
        rotate: e.button === 2 || e.shiftKey || e.ctrlKey,
        tiltOnly: e.altKey && !e.ctrlKey,
        moved: false,
      }
    }}
    onpointermove={move}
    onpointerup={releasePointer}
    onpointercancel={releasePointer}
  >
    <defs>
      {#each data.unit_polygon.features.filter(isBrand) as unit}
        <clipPath id={`${maskId}-${value(unit.properties, 'unit_id')}`}>
          <path d={projection.path(unit)} />
        </clipPath>
      {/each}
      <clipPath id={`${maskId}-floors`}>
        {#each levels as level}
          <path d={projection.path(level)} clip-rule="evenodd" />
        {/each}
      </clipPath>
      <mask
        id={`${maskId}-outside`}
        maskUnits="userSpaceOnUse"
        x={viewport[0]}
        y={viewport[1]}
        width={viewport[2]}
        height={viewport[3]}
      >
        <rect
          x={viewport[0]}
          y={viewport[1]}
          width={viewport[2]}
          height={viewport[3]}
          fill="white"
        />
        {#each levels as level}
          <path d={projection.path(level)} fill="black" fill-rule="evenodd" />
        {/each}
      </mask>
    </defs>
    {#each levels as level}
      {@const id = value(level.properties, 'level_id')}
      {@const floorAnchor = projection.anchor(level)}
      {@const title = value(level.properties, 'level_name_en')
        .replace(' Ground Level', ' · G')
        .replace(' Mezzanine Level', ' · M')
        .replace(' Level', '')}
      {@const titleX = Math.min(
        floorAnchor[0],
        baseView[0] +
          (baseView[2] * (1 + 1 / zoom)) / 2 +
          panX -
          (title.length * 6 + 30) * textScale,
      )}
      <IndoorFloorLayer
        {level}
        artworkOpacity={station.artworkOpacity}
        artwork={data.coordinateSpace === 'image-pixels'
          ? {
              src: value(level.properties, 'image_url'),
              width: Number(level.properties.image_width),
              height: Number(level.properties.image_height),
            }
          : undefined}
        units={data.unit_polygon.features.filter(f => f.properties.level_id === id)}
        entries={station.entries.filter(p => p.levelId === id)}
        treads={treads.filter(f => f.properties.level_id === id)}
        {projection}
        {shops}
        {connections}
        {brand}
        {maskId}
        exploded={station.exploded}
        selectedId={station.selected?.id}
        opacity={station.route && id !== station.route.points.at(-1)?.level
          ? 1 - station.arrival
          : 1}
        {textScale}
        {titleX}
        {dragged}
        {activate}
        {chooseFloor}
        onSelectPlace={place => {
          station.select(place)
          onSelect()
        }}
      />
    {/each}
    <g opacity={1 - station.arrival}>
      {#if station.exploded}
        {#each connections as connection}
          {@const a = data.unit_polygon.features.find(
            f => f.properties.unit_id === connection.from,
          )}
          {@const b = data.unit_polygon.features.find(
            f => f.properties.unit_id === connection.to,
          )}
          {#if a && b}
            {@const from = projection.project(centre(a), connection.fromLevel)}
            {@const to = projection.project(centre(b), connection.toLevel)}
            <line
              x1={from[0]}
              y1={from[1]}
              x2={to[0]}
              y2={to[1]}
              stroke="var(--station-connector)"
              stroke-width="1.3"
              stroke-dasharray={connection.evidence !== 'aligned-footprints'
                ? undefined
                : '4 4'}
              mask={`url(#${maskId}-outside)`}
              vector-effect="non-scaling-stroke"
              data-connection={connection.evidence}
            >
              <title>
                {connection.evidence === 'matching-lift-code'
                  ? `${value(a.properties, 'unit_name_en')} · matching lift code`
                  : connection.evidence === 'reviewed-layout'
                    ? `${value(a.properties, 'unit_name_en')} · ${value(b.properties, 'level_name_en')} · MTR layout`
                    : connection.evidence === 'editor-verified'
                      ? 'Verified by map editor'
                      : 'Possible connection · unverified'}
              </title>
            </line>
            <line
              x1={from[0]}
              y1={from[1]}
              x2={to[0]}
              y2={to[1]}
              stroke="var(--station-connector)"
              stroke-width="1.3"
              vector-effect="non-scaling-stroke"
              stroke-dasharray={connection.evidence === 'aligned-footprints'
                ? '4 4'
                : undefined}
              opacity="0.5"
              clip-path={`url(#${maskId}-floors)`}
              data-through-floor="true"
            />
            <circle
              cx={from[0]}
              cy={from[1]}
              r={2 * textScale}
              fill="var(--station-connector)"
            />
            <circle
              cx={to[0]}
              cy={to[1]}
              r={2 * textScale}
              fill="var(--station-connector)"
            />
          {/if}
        {/each}
      {/if}
    </g>
    {#if station.route}
      <g pointer-events="none" data-indoor-route>
        {#each routeSegments as segment}
          {@const a = projection.project(segment.a.point, segment.a.level)}
          {@const b = projection.project(segment.b.point, segment.b.level)}
          {@const targetLevel = station.route.points.at(-1)?.level}
          <line
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke="var(--station-paper)"
            stroke-width="7"
            vector-effect="non-scaling-stroke"
            opacity={segment.a.level === targetLevel && segment.b.level === targetLevel
              ? 1
              : 1 - station.arrival}
          />
          <line
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke="var(--station-accent)"
            stroke-width="3.5"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
            opacity={segment.a.level === targetLevel && segment.b.level === targetLevel
              ? 1
              : 1 - station.arrival}
          />
        {/each}
        {#if traveller}
          <circle
            cx={traveller[0]}
            cy={traveller[1]}
            r={5 * textScale}
            fill="var(--station-accent)"
            stroke="var(--station-paper)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
            data-route-traveller
          />
        {/if}
      </g>
    {/if}
  </svg>
</div>
