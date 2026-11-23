<script lang="ts">
import { paintedIndoorUnits, exposedIndoorUnits } from '#lib/indoor/exposure.js'
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { fade } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// DATA
import {
  centre,
  value,
  type IndoorData,
  type Place,
  type IndoorFeature,
} from '#lib/indoor/model.js'
import IndoorFloorLayer from './IndoorFloorLayer.svelte'
import { prepareConnectorReliefs } from '#lib/indoor/connectorRelief.js'
import { shopArtwork } from '#lib/indoor/artwork.js'
import { cameraTravel, floorInViewport } from '#lib/indoor/cameraTransition.js'
import { stationFloorCallout } from '#lib/indoor/levels.js'
import { stationProjection } from '#lib/indoor/scene.js'
import { connectionCandidates, stairTreads } from '#lib/indoor/spatial.js'
import type { StationState } from '#lib/indoor/station.svelte.js'
let {
  station,
  data,
  onSelect,
  allowSelection = true,
}: {
  station: StationState
  data: IndoorData
  onSelect: () => void
  /** Embedded profiles retain their selected building part while allowing camera controls. */
  allowSelection?: boolean
} = $props()
// Share the camera control preference between the public viewer and embedded maps.
const screenAlignedLogos = $derived(station.screenAlignedLogos)
// Separate the destination camera from the displayed pose so geometry and zoom move together.
const targetPose = $derived(
  station.returningToMap
    ? {
        bearing: -(station.worldView?.bearing ?? -station.bearing),
        tilt: station.worldView?.pitch ?? station.planTilt,
        spacing: 0,
      }
    : {
        bearing: station.bearing,
        tilt: station.exploded ? station.tilt : station.planTilt,
        spacing: station.exploded ? station.spacing : 0,
      },
)
let displayedPose = $state(untrack(() => targetPose))
// The map rotates north clockwise by its bearing; the viewing heading is the inverse.
const compassHeading = $derived(
  ((Math.round(-displayedPose.bearing) % 360) + 360) % 360,
)
const compassDirection = $derived(
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(compassHeading / 45) % 8],
)
let modeAnimating = $state(false)
let detailOpacity = $state(untrack(() => (station.exploded ? 0 : 1)))
let displayedExploded = $state(untrack(() => station.exploded))
const targetProjection = $derived(stationProjection(data, true, targetPose))
const projection = $derived(stationProjection(data, true, displayedPose))
// Source-local geometry is reusable across camera frames and discarded with this snapshot.
const flatProjection = $derived(stationProjection(data, false, { bearing: 0, tilt: 0 }))
const showExploded = $derived(
  station.exploded || displayedExploded || (modeAnimating && !station.returningToMap),
)
const targetLevels = $derived(
  data.level_polygon.features.filter(
    f =>
      (station.exploded || f.properties.level_id === station.floor) &&
      (station.arrival < 1 ||
        f.properties.level_id === station.route?.points.at(-1)?.level),
  ),
)
// Keep every floor mounted until the selected floor has reached its plan position.
const levels = $derived(
  data.level_polygon.features
    .filter(
      f =>
        (showExploded || f.properties.level_id === station.floor) &&
        (station.arrival < 1 ||
          f.properties.level_id === station.route?.points.at(-1)?.level),
    )
    .toSorted(
      (a, b) => Number(a.properties.level_ordinal) - Number(b.properties.level_ordinal),
    ),
)
const projectReliefs = $derived(prepareConnectorReliefs(data))
const reliefs = $derived(projectReliefs(projection))
const connections = $derived(
  connectionCandidates(data).filter(
    c => station.showInferred || c.evidence !== 'aligned-footprints',
  ),
)
// Share source paint order and exposed hit geometry with the directory.
const visibleUnits = $derived(paintedIndoorUnits(data))
const exposedUnits = $derived(exposedIndoorUnits(data))
const treads = $derived(stairTreads(data).features)
const shops = $derived(
  new Map(
    station.entries
      .filter(
        p => p.kind === 'shop' || (data.coordinateSpace === 'image-pixels' && p.code),
      )
      .map(p => [p.id, p]),
  ),
)
const brand = (feature: IndoorFeature) =>
  shopArtwork(shops.get(value(feature.properties, 'unit_id')))

const focused = $derived(station.selected ? [station.selected.feature] : targetLevels)
const box = $derived(targetProjection.box(focused))
// Leave room at the map edge for labels beside their individual floors.
const labelGutter = $derived(station.exploded ? Math.max(60, box[2] * 0.35) : 18)
const fittedView = $derived([
  box[0] - labelGutter,
  box[1] - 24,
  box[2] + labelGutter + 18,
  box[3] + 48,
])
// Overlapping floor switches keep the source-coordinate frame, including manual pan and zoom.
let retainedView = $state<number[] | null>(null)
const baseView = $derived(retainedView ?? fittedView)
let travel = $state<ReturnType<typeof cameraTravel> | null>(null)
let travelTimer: ReturnType<typeof setTimeout> | undefined
onDestroy(() => clearTimeout(travelTimer))
$effect(() => {
  station.preserveFloorCamera = id => {
    clearTimeout(travelTimer)
    travel = null
    const current = (displayedViewBox || viewBox).split(' ').map(Number)
    const scale = Math.max(current[2] / width, current[3] / height)
    const visible = [
      current[0] + (current[2] - width * scale) / 2,
      current[1] + (current[3] - height * scale) / 2,
      width * scale,
      height * scale,
    ]
    const destination = data.level_polygon.features.filter(
      f => f.properties.level_id === id,
    )
    // Preserve overlapping floors; recenter only when the entire destination is off screen.
    if (
      id !== station.floor &&
      destination.length &&
      !floorInViewport(destination, projection, visible)
    ) {
      const bounds = projection.box(destination)
      const from: [number, number] = [
        current[0] + current[2] / 2,
        current[1] + current[3] / 2,
      ]
      const to: [number, number] = [
        bounds[0] + bounds[2] / 2,
        bounds[1] + bounds[3] / 2,
      ]
      const delta: [number, number] = [to[0] - from[0], to[1] - from[1]]
      // Schematic artwork has no geographic scale, so never claim a distance in metres.
      if (data.coordinateSpace !== 'image-pixels') {
        travel = cameraTravel(
          projection.unproject(from, station.floor),
          projection.unproject(to, id),
          delta,
        )
      } else {
        travel = {
          distance: '',
          direction: 'across the floor plan',
          angle: (Math.atan2(delta[0], -delta[1]) * 180) / Math.PI,
        }
      }
      travelTimer = setTimeout(() => {
        travel = null
      }, 3200)
      retainedView = [
        to[0] - current[2] / 2,
        to[1] - current[3] / 2,
        current[2],
        current[3],
      ]
    } else retainedView = current
    zoom = 1
    panX = 0
    panY = 0
  }
  return () => {
    station.preserveFloorCamera = null
  }
})
// Allow a wider floor overview consistently across wheel, pinch, and keyboard input.
const MIN_ZOOM = 0.25
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
  mode: 'pan' | 'spin' | 'orbit' | 'tilt'
  orbit?: { point: [number, number]; level: string; center: [number, number] }
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
    retainedView = null
    zoom = 1
    panX = 0
    panY = 0
  })
})
// Rank against the visible camera centre before index navigation changes floor or zoom.
$effect(() => {
  station.rankIndexPlaces = candidates => {
    const x = baseView[0] + baseView[2] / 2 + panX
    const y = baseView[1] + baseView[3] / 2 + panY
    const distance = (place: Place): number => {
      const point = projection.project(centre(place.feature), place.levelId)
      return Math.hypot(point[0] - x, point[1] - y)
    }
    return [...candidates].sort(
      (a, b) =>
        (!station.exploded
          ? Number(b.levelId === station.floor) - Number(a.levelId === station.floor)
          : 0) ||
        distance(a) - distance(b) ||
        a.id.localeCompare(b.id),
    )
  }
  return () => {
    station.rankIndexPlaces = null
  }
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
        a = targetProjection.project(segment.a.point, segment.a.level),
        b = targetProjection.project(segment.b.point, segment.b.level)
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    remaining -= segment.length
  }
  return null
})
const viewBox = $derived.by(() => {
  if (station.returningToMap && station.worldView) {
    const point = targetProjection.project(station.worldView.center, station.floor)
    const w = station.worldView.metresPerPixel * width
    const h = station.worldView.metresPerPixel * height
    return `${point[0] - w / 2} ${point[1] - h / 2} ${w} ${h}`
  }
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
// Animate navigation from the currently displayed camera; gestures remain immediate.
let displayedViewBox = $state('')
let cameraAnimating = $state(false)
let lastCameraSelection = ''
let lastCameraFloor: {
  code: string
  id: string
  exploded: boolean
} | null = null
$effect(() => {
  const target = viewBox.split(' ').map(Number)
  const pose = targetPose
  const exploded = station.exploded
  const fromPose = untrack(() => displayedPose)
  const fromDetailOpacity = untrack(() => detailOpacity)
  const targetDetailOpacity = exploded ? 0 : 1
  const selection = `${station.code}:${station.floor}:${station.selected?.id ?? ''}:${station.exploded}:${station.returningToMap}`
  const reduced = prefersReducedMotion.current
  const previous = untrack(() => displayedViewBox)
  const navigating = selection !== lastCameraSelection || untrack(() => cameraAnimating)
  lastCameraSelection = selection
  const previousFloor = lastCameraFloor
  lastCameraFloor = {
    code: station.code,
    id: station.floor,
    exploded: station.exploded,
  }
  const modeChanged = Boolean(
    previousFloor &&
      previousFloor.code === station.code &&
      previousFloor.exploded !== station.exploded,
  )
  const changingMode =
    station.returningToMap || modeChanged || untrack(() => modeAnimating)
  if (!previous || !navigating || reduced || station.routeMode === 'flying') {
    displayedViewBox = viewBox
    displayedPose = pose
    displayedExploded = exploded
    detailOpacity = targetDetailOpacity
    modeAnimating = false
    cameraAnimating = false
    if (station.returningToMap) station.returnSceneReady = true
    return
  }
  const from = previous.split(' ').map(Number)
  // Flat floor changes crossfade in their shared frame, flying to off-screen destinations without changing scale.
  const start = performance.now()
  let frame = 0
  cameraAnimating = true
  modeAnimating = changingMode
  // Rotate via the shortest arc, while flattening the same geometry and fitting its view.
  const bearingDelta = ((pose.bearing - fromPose.bearing + 540) % 360) - 180
  const step = (now: number): void => {
    const progress = Math.min(1, (now - start) / (changingMode ? 700 : 420))
    const eased = progress * progress * (3 - 2 * progress)
    // Reveal details only in the final part of the move; reach full opacity at settlement.
    const detailProgress =
      changingMode && !exploded ? Math.max(0, (progress - 0.8) / 0.2) : eased
    detailOpacity =
      fromDetailOpacity + (targetDetailOpacity - fromDetailOpacity) * detailProgress
    displayedPose = {
      bearing: fromPose.bearing + bearingDelta * eased,
      tilt: fromPose.tilt + (pose.tilt - fromPose.tilt) * eased,
      spacing: fromPose.spacing + (pose.spacing - fromPose.spacing) * eased,
    }
    displayedViewBox = target
      .map((value, index) => from[index] + (value - from[index]) * eased)
      .join(' ')
    if (progress < 1) frame = requestAnimationFrame(step)
    else {
      cameraAnimating = false
      modeAnimating = false
      displayedPose = pose
      displayedExploded = exploded
      if (station.returningToMap) station.returnSceneReady = true
    }
  }
  frame = requestAnimationFrame(step)
  return () => cancelAnimationFrame(frame)
})
const viewport = $derived((displayedViewBox || viewBox).split(' ').map(Number))
// Capture the actual panned viewport, not the station's default bounds.
$effect(() => {
  if (station.returningToMap) return
  if (data.coordinateSpace === 'image-pixels') {
    station.worldView = null
    return
  }
  const center = projection.unproject(
    [viewport[0] + viewport[2] / 2, viewport[1] + viewport[3] / 2],
    station.floor,
  )
  const metresPerPixel = Math.max(viewport[2] / width, viewport[3] / height) * 2.5
  station.worldView = {
    center,
    bearing: -displayedPose.bearing,
    pitch: displayedPose.tilt,
    metresPerPixel,
    zoom: Math.log2(
      (40075016.686 * Math.cos((center[1] * Math.PI) / 180)) / (512 * metresPerPixel),
    ),
  }
})
const textScale = $derived(Math.max(viewport[2] / width, viewport[3] / height))
// SVG's centred aspect-ratio fit exposes space beyond the nominal viewBox on wide/tall screens.
const maskViewport = $derived([
  viewport[0] + (viewport[2] - width * textScale) / 2,
  viewport[1] + (viewport[3] - height * textScale) / 2,
  width * textScale,
  height * textScale,
])
const maskId = $props.id()
function wheel(event: WheelEvent): void {
  cameraAnimating = false
  event.preventDefault()
  station.stopFly()
  if (event.altKey && event.ctrlKey)
    updateTilt(
      (station.exploded ? station.tilt : station.planTilt) - event.deltaY * 0.08,
    )
  else if (event.altKey) station.bearing += event.deltaY * 0.12
  else zoom = Math.max(MIN_ZOOM, Math.min(12, zoom * Math.exp(-event.deltaY * 0.001)))
}
function move(event: PointerEvent): void {
  if (pointers.has(event.pointerId))
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    zoom = Math.max(
      MIN_ZOOM,
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
  if (drag.mode !== 'pan') {
    if (drag.mode !== 'tilt')
      station.bearing = drag.bearing + (event.clientX - drag.x) * 0.4
    if (drag.mode !== 'spin') updateTilt(drag.tilt - (event.clientY - drag.y) * 0.3)
    // Orbit the captured ground point, preserving its screen position and the current zoom.
    if (drag.orbit) {
      const camera = stationProjection(data, true, {
        bearing: station.bearing,
        tilt: station.exploded ? station.tilt : station.planTilt,
        spacing: station.exploded ? station.spacing : 0,
      })
      const point = camera.project(drag.orbit.point, drag.orbit.level)
      panX = point[0] - drag.orbit.center[0]
      panY = point[1] - drag.orbit.center[1]
    }
  } else {
    panX = drag.px - (event.clientX - drag.x) * scale
    panY = drag.py - (event.clientY - drag.y) * scale
  }
  drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4
  if (drag.moved) svg.setPointerCapture(event.pointerId)
}
function activate(event: MouseEvent, feature: IndoorFeature): void {
  event.stopPropagation()
  if (dragged || !allowSelection) return
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
  if (!allowSelection) return
  station.openFloor(id)
}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (This keyboard map application provides zoom controls and equivalent panel selection.) -->
<div
  class="focus-visible:ring-primary h-full w-full bg-[var(--station-canvas)] outline-none focus-visible:ring-1"
  role="application"
  aria-label="Station plan controls"
  /* biome-ignore lint/a11y/noNoninteractiveTabindex: this map application owns keyboard zoom. */
  tabindex="0"
  onkeydown={e => {
    station.stopFly()
    if (e.key === '+' || e.key === '=') zoom = Math.min(12, zoom * 1.3)
    if (e.key === '-') zoom = Math.max(MIN_ZOOM, zoom / 1.3)
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
      retainedView = null
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
    viewBox={displayedViewBox || viewBox}
    data-camera-animating={cameraAnimating}
    data-camera-bearing={displayedPose.bearing}
    data-camera-tilt={displayedPose.tilt}
    data-logo-mode={screenAlignedLogos ? 'screen-aligned' : 'default'}
    class="h-full w-full touch-none outline-none select-none"
    data-station-scene={station.exploded ? 'exploded' : 'plan'}
    data-station-transition={modeAnimating ? 'moving' : 'settled'}
    role="application"
    aria-label={station.exploded
      ? 'Exploded station levels. Select a floor to open its plan.'
      : 'Station floor plan. Drag to pan, scroll to zoom.'}
    oncontextmenu={e => e.preventDefault()}
    ondragstart={e => e.preventDefault()}
    onwheel={wheel}
    data-route-mode={station.routeMode}
    data-route-progress={station.routeProgress}
    data-bearing={station.bearing}
    data-tilt={station.tilt}
    onpointerdown={e => {
      cameraAnimating = false
      if (e.button !== 0 && e.button !== 2) return
      // Own the gesture before native image dragging or SVG text selection can intercept it.
      e.preventDefault()
      svg.parentElement?.focus({ preventScroll: true })
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
      const mode = e.altKey
        ? 'tilt'
        : e.ctrlKey || e.button === 2
          ? 'orbit'
          : e.shiftKey
            ? 'spin'
            : 'pan'
      const center: [number, number] = [
        viewport[0] + viewport[2] / 2,
        viewport[1] + viewport[3] / 2,
      ]
      const level = station.floor || value(levels[0]?.properties ?? {}, 'level_id')
      const orbit =
        mode === 'orbit'
          ? { point: projection.unproject(center, level), level, center }
          : undefined
      if (orbit) {
        // Freeze the visible frame so rotating bounds cannot recenter or rescale an orbit.
        retainedView = [
          center[0] - (viewport[2] * zoom) / 2,
          center[1] - (viewport[3] * zoom) / 2,
          viewport[2] * zoom,
          viewport[3] * zoom,
        ]
        panX = 0
        panY = 0
      }
      drag = {
        x: e.clientX,
        y: e.clientY,
        px: panX,
        py: panY,
        bearing: station.bearing,
        tilt: station.exploded ? station.tilt : station.planTilt,
        mode,
        orbit,
        moved: false,
      }
    }}
    onpointermove={move}
    onpointerup={releasePointer}
    onpointercancel={releasePointer}
  >
    <defs>
      <clipPath id={`${maskId}-floors`}>
        {#each levels as level}
          <path d={projection.path(level)} clip-rule="evenodd" />
        {/each}
      </clipPath>
      <mask
        id={`${maskId}-outside`}
        maskUnits="userSpaceOnUse"
        x={maskViewport[0]}
        y={maskViewport[1]}
        width={maskViewport[2]}
        height={maskViewport[3]}
      >
        <rect
          x={maskViewport[0]}
          y={maskViewport[1]}
          width={maskViewport[2]}
          height={maskViewport[3]}
          fill="white"
        />
        {#each levels as level}
          <path d={projection.path(level)} fill="black" fill-rule="evenodd" />
        {/each}
      </mask>
    </defs>
    {#each levels as level (value(level.properties, 'level_id'))}
      {@const id = value(level.properties, 'level_id')}
      <g
        transition:fade={{ duration: prefersReducedMotion.current ? 0 : 240 }}
        data-floor-transition={id}
      >
        <IndoorFloorLayer
          {level}
          {reliefs}
          {connections}
          artworkOpacity={station.artworkOpacity}
          artwork={data.coordinateSpace === 'image-pixels'
            ? {
                src: value(level.properties, 'image_url'),
                width: Number(level.properties.image_width),
                height: Number(level.properties.image_height),
              }
            : undefined}
          units={visibleUnits.filter(f => f.properties.level_id === id)}
          hitUnits={[...exposedUnits.values()].filter(
            f => f.properties.level_id === id,
          )}
          entries={station.entries.filter(p => p.levelId === id)}
          treads={treads.filter(f => f.properties.level_id === id)}
          {projection}
          {screenAlignedLogos}
          {flatProjection}
          {shops}
          {brand}
          {maskId}
          exploded={showExploded}
          detailOpacity={id === station.floor ? detailOpacity : 0}
          selectedId={station.selected?.id}
          opacity={station.route && id !== station.route.points.at(-1)?.level
            ? 1 - station.arrival
            : 1}
          {textScale}
          {dragged}
          {activate}
          {chooseFloor}
          onSelectPlace={place => {
            if (!allowSelection) return
            station.select(place)
            onSelect()
          }}
        />
      </g>
    {/each}
    <g opacity={1 - station.arrival}>
      {#if showExploded}
        <!-- Apply shared floor occlusion once per pass, rather than once for every connector. -->
        {#each ['outside', 'inside', 'endpoints'] as pass}
          <g
            mask={pass === 'outside' ? `url(#${maskId}-outside)` : undefined}
            clip-path={pass === 'inside' ? `url(#${maskId}-floors)` : undefined}
            data-connection-pass={pass}
          >
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
                {@const dash =
                  connection.category === 'elevator'
                    ? undefined
                    : connection.category === 'ramp'
                      ? '0 4 5 4'
                      : ['stairs', 'steps'].includes(connection.category)
                        ? '0 4'
                        : '5 4'}
                {#if pass === 'outside'}
                  <line
                    x1={from[0]}
                    y1={from[1]}
                    x2={to[0]}
                    y2={to[1]}
                    stroke="var(--station-connector)"
                    stroke-width="1.3"
                    stroke-dasharray={dash}
                    stroke-linecap="round"
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
                {:else if pass === 'inside'}
                  <line
                    x1={from[0]}
                    y1={from[1]}
                    x2={to[0]}
                    y2={to[1]}
                    stroke="var(--station-connector)"
                    stroke-width="1.3"
                    vector-effect="non-scaling-stroke"
                    stroke-dasharray={dash}
                    stroke-linecap="round"
                    opacity="0.25"
                    data-through-floor="true"
                  />
                {:else}
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
              {/if}
            {/each}
          </g>
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
    <!-- Paint all leaders before all labels so floors, connections and routes cannot cover the labels. -->
    {#if showExploded}
      <g data-floor-labels>
        {#each levels as level (value(level.properties, 'level_id'))}
          {@const id = value(level.properties, 'level_id')}
          {@const title = stationFloorCallout(value(level.properties, 'level_name_en'))}
          {@const titleX =
            projection.anchor(level)[0] - (title.length * 6 + 36) * textScale}
          {@const floorAnchor = projection.anchor(level)}
          <g
            transition:fade={{ duration: prefersReducedMotion.current ? 0 : 240 }}
            opacity={station.route && id !== station.route.points.at(-1)?.level
              ? 1 - station.arrival
              : 1}
          >
            <!-- Keep the label just outside its own floor, with a short leader to the edge. -->
            <line
              x1={titleX + (title.length * 6 + 26) * textScale}
              y1={floorAnchor[1] - 13 * textScale}
              x2={floorAnchor[0]}
              y2={floorAnchor[1]}
              stroke="var(--station-edge)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
              pointer-events="none"
            />
          </g>
        {/each}
        {#each levels as level (value(level.properties, 'level_id'))}
          {@const id = value(level.properties, 'level_id')}
          {@const title = stationFloorCallout(value(level.properties, 'level_name_en'))}
          {@const titleX =
            projection.anchor(level)[0] - (title.length * 6 + 36) * textScale}
          {@const floorAnchor = projection.anchor(level)}
          <g
            transition:fade={{ duration: prefersReducedMotion.current ? 0 : 240 }}
            opacity={station.route && id !== station.route.points.at(-1)?.level
              ? 1 - station.arrival
              : 1}
          >
            <!-- biome-ignore lint/a11y/useSemanticElements: this keyboard-operable SVG label selects its floor. -->
            <g
              role="button"
              tabindex="0"
              aria-label={`Open ${value(level.properties, 'level_name_en')}`}
              class="cursor-pointer outline-none focus:opacity-60"
              onclick={() => {
                if (!dragged) chooseFloor(id)
              }}
              onkeydown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  chooseFloor(id)
                }
              }}
            >
              <rect
                x={titleX}
                y={floorAnchor[1] - 24 * textScale}
                width={(title.length * 6 + 24) * textScale}
                height={22 * textScale}
                rx={4 * textScale}
                fill="var(--station-paper)"
              />
              <text
                x={titleX + 6 * textScale}
                y={floorAnchor[1] - 10 * textScale}
                font-size={11 * textScale}
                fill="var(--station-ink)"
              >
                {title}
                ↗
              </text>
            </g>
          </g>
        {/each}
      </g>
    {/if}
  </svg>
  {#if data.coordinateSpace !== 'image-pixels'}
    <div
      data-station-compass
      data-heading={compassHeading}
      role="img"
      aria-label={`Map compass, looking ${compassDirection}, ${compassHeading} degrees. North is indicated by the pointed needle.`}
      class="pointer-events-none absolute top-24 left-5 z-30 flex flex-col items-center gap-1 text-[color-mix(in_srgb,var(--station-ink)_70%,var(--station-canvas))] sm:top-6 sm:left-7"
    >
      <svg viewBox="0 0 64 64" class="size-14 sm:size-16" aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r="22"
          fill="none"
          stroke="currentColor"
          stroke-width="0.75"
          opacity="0.2"
        />
        {#each Array.from({ length: 12 }, (_, index) => index) as tick}
          <path
            d={tick % 3 === 0 ? 'M32 10v4' : 'M32 10v2'}
            transform={`rotate(${tick * 30} 32 32)`}
            stroke="currentColor"
            stroke-width="1"
            opacity={tick % 3 === 0 ? 0.6 : 0.3}
          />
        {/each}
        <g transform={`rotate(${displayedPose.bearing} 32 32)`}>
          <path d="M32 17l5 15-5-2-5 2Z" fill="currentColor" />
          <path d="M32 47l5-15-5 2-5-2Z" fill="currentColor" opacity="0.25" />
          <text
            x="32"
            y="6"
            text-anchor="middle"
            dominant-baseline="central"
            font-size="8"
            font-weight="600"
            fill="currentColor"
            transform={`rotate(${-displayedPose.bearing} 32 6)`}
          >
            N
          </text>
        </g>
        <circle cx="32" cy="32" r="1.5" fill="currentColor" />
      </svg>
      <span class="text-[10px] font-medium tracking-[0.12em] tabular-nums"
        >{compassDirection}
        · {compassHeading}°</span
      >
    </div>
  {/if}
  {#if travel}
    <div
      role="status"
      data-camera-travel
      class="pointer-events-none absolute bottom-[180px] left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 text-sm text-[color-mix(in_srgb,var(--station-ink)_65%,var(--station-canvas))]"
      in:fade={{ duration: prefersReducedMotion.current ? 0 : 280 }}
      out:fade={{ duration: prefersReducedMotion.current ? 0 : 600 }}
    >
      <svg
        viewBox="0 0 40 40"
        class="size-8 shrink-0"
        aria-hidden="true"
        style:transform={`rotate(${travel.angle}deg)`}
      >
        <circle cx="20" cy="32" r="2" fill="currentColor" />
        <path
          d="M20 29V8M12 16l8-8 8 8"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="flex flex-col gap-0.5">
        <span class="text-[10px] font-medium tracking-[0.16em] uppercase opacity-75"
          >Moving</span
        >
        <span class="font-medium tracking-wide"
          >{travel.distance} {travel.direction}</span
        >
      </span>
    </div>
  {/if}
</div>
