<!-- biome-ignore-all lint/a11y/noNoninteractiveTabindex: This interactive SVG viewport supports keyboard pan and zoom. -->
<script lang="ts">
// COMPONENTS
import ConnectionFacilityIcon from './ConnectionFacilityIcon.svelte'
// DOMAIN
import { value } from '#lib/indoor/model.js'
import { connectionAnchor, nearestEntranceSide } from '#lib/indoor/connectionEditor.js'
import { entranceEdges } from '#lib/indoor/connectionCorrections.js'
// TYPES
import type { IndoorData, IndoorFeature } from '#lib/indoor/model.js'
import type { EntranceSide } from '#lib/indoor/releases.js'
import type { StationProjection } from '#lib/indoor/scene.js'

let {
  data,
  projection,
  floor,
  selected,
  entrance = null,
  viewBox,
  side,
  disabled,
  state: facilityState,
  onChoose,
  exteriorPoint,
  onExteriorChoose,
  onPan,
  onZoom,
}: {
  data: IndoorData
  projection: StationProjection
  floor: string
  selected: string
  entrance?: EntranceSide | null
  viewBox: string
  side: string
  disabled: boolean
  state: (unit: IndoorFeature) => string
  exteriorPoint?: [number, number]
  onExteriorChoose?: (point: [number, number]) => void
  onChoose: (unit: IndoorFeature, entrance?: EntranceSide) => void
  onPan: (x: number, y: number) => void
  onZoom: (factor: number, point?: [number, number]) => void
} = $props()
const floors = $derived(
  data.level_polygon.features.filter(f => value(f.properties, 'level_id') === floor),
)
const units = $derived(
  data.unit_polygon.features.filter(f => value(f.properties, 'level_id') === floor),
)
const selectedUnit = $derived(
  units.find(unit => value(unit.properties, 'unit_id') === selected),
)
const iconSize = $derived(Number(viewBox.split(' ')[2]) / 23)
let drag: {
  x: number
  y: number
  startX: number
  startY: number
  moved: boolean
} | null = null
let suppressClick = false
let svg: SVGSVGElement
let hovered = $state<{ unit: IndoorFeature; side: EntranceSide } | null>(null)

/** Preview the edge nearest the pointer without changing the draft. @param unit Hovered facility. @param event Pointer movement. @returns Nothing. */
function preview(unit: IndoorFeature, event: PointerEvent): void {
  if (disabled || drag?.moved) return
  const edge = nearestEntranceSide(unit, point(svg, event.clientX, event.clientY), p =>
    projection.project(p, floor),
  )
  hovered = edge ? { unit, side: edge } : null
}
/** Compare stable source-edge identities. @param a First side. @param b Second side. @returns Whether both refer to the same outer edge. */
function sameSide(a: EntranceSide | null | undefined, b: EntranceSide): boolean {
  return a?.polygonIndex === b.polygonIndex && a.edgeIndex === b.edgeIndex
}

/** Convert pointer coordinates into the shared map plane. @param svg Pane SVG. @param x Screen X. @param y Screen Y. @returns Map XY. */
function point(svg: SVGSVGElement, x: number, y: number): [number, number] {
  const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()?.inverse())
  return [p.x, p.y]
}
/** Install cancellable wheel zoom without blocking scrolling outside the map. @param node Pane SVG. @returns Listener cleanup. */
function wheelZoom(node: SVGSVGElement): { destroy: () => void } {
  const wheel = (event: WheelEvent): void => {
    event.preventDefault()
    const delta =
      event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1)
    onZoom(
      Math.exp(Math.max(-200, Math.min(200, delta)) * 0.002),
      point(node, event.clientX, event.clientY),
    )
  }
  node.addEventListener('wheel', wheel, { passive: false })
  return { destroy: () => node.removeEventListener('wheel', wheel) }
}
/** Select the facility and nearest entrance in one click, never after a drag. @param unit Facility. @param event Pointer click. @returns Nothing. */
function choose(unit: IndoorFeature, event: MouseEvent): void {
  if (disabled || suppressClick) return
  const edge = nearestEntranceSide(unit, point(svg, event.clientX, event.clientY), p =>
    projection.project(p, floor),
  )
  onChoose(unit, edge ?? undefined)
}
/** Resolve the state colour shared with the legend. @param status State. @returns SVG colour. */
function colour(status: string): string {
  return status === 'Selected'
    ? '#9333ea'
    : status === 'Available'
      ? '#15803d'
      : status === 'Linked'
        ? '#2563eb'
        : '#ea580c'
}
</script>

<div
  class="border-border relative aspect-square min-w-0 overflow-hidden rounded-lg border bg-slate-50"
  data-connection-map={side}
>
  <!-- The map viewport supports keyboard pan and zoom in addition to pointer gestures. -->
  <svg
    bind:this={svg}
    use:wheelZoom
    {viewBox}
    class="size-full cursor-grab touch-none active:cursor-grabbing"
    aria-label={`${side} floor plan`}
    role="application"
    tabindex="0"
    onclick={event => {
      if (!disabled && !suppressClick && onExteriorChoose) {
        const xy = point(svg, event.clientX, event.clientY)
        onExteriorChoose(projection.unproject(xy, floor))
      }
    }}
    onpointerdown={event => {
      if (event.button !== 0) return
      suppressClick = false
      drag = {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      }
    }}
    onpointermove={event => {
      if (!drag) return
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
        drag.moved = true
        hovered = null
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      if (!drag.moved) return
      const a = point(event.currentTarget, drag.x, drag.y)
      const b = point(event.currentTarget, event.clientX, event.clientY)
      onPan(a[0] - b[0], a[1] - b[1])
      drag.x = event.clientX
      drag.y = event.clientY
    }}
    onpointerup={event => {
      suppressClick = drag?.moved ?? false
      drag = null
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onpointercancel={() => {
      drag = null
      suppressClick = true
    }}
    onpointerleave={() => {
      hovered = null
      if (drag && !drag.moved) drag = null
    }}
    onkeydown={event => {
      if (event.target !== event.currentTarget) return
      if (
        onExteriorChoose &&
        !disabled &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        event.preventDefault()
        const [x, y, size] = viewBox.split(' ').map(Number)
        onExteriorChoose(projection.unproject([x + size / 2, y + size / 2], floor))
      }
      const step = Number(viewBox.split(' ')[2]) / 10
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(
          event.key,
        )
      )
        event.preventDefault()
      if (event.key === 'ArrowLeft') onPan(-step, 0)
      if (event.key === 'ArrowRight') onPan(step, 0)
      if (event.key === 'ArrowUp') onPan(0, -step)
      if (event.key === 'ArrowDown') onPan(0, step)
      if (event.key === '+' || event.key === '=') onZoom(0.8)
      if (event.key === '-') onZoom(1.25)
    }}
  >
    {#each floors as feature}
      <path
        d={projection.path(feature)}
        fill="#e2e8f0"
        stroke="#94a3b8"
        stroke-width="0.5"
        fill-rule="evenodd"
      />
      {#if data.coordinateSpace === 'image-pixels'}
        {@const origin = projection.project([0, 0], floor)}
        <image
          href={value(feature.properties, 'image_url')}
          x={origin[0]}
          y={origin[1]}
          width={Number(feature.properties.image_width) * 0.2}
          height={Number(feature.properties.image_height) * 0.2}
        />
      {/if}
    {/each}
    <!-- Draw all background units first so source ordering cannot cover a selectable facility. -->
    {#each units as unit}
      <path
        d={projection.path(unit)}
        fill={data.coordinateSpace === 'image-pixels' ? 'transparent' : '#f8fafc'}
        stroke="#cbd5e1"
        stroke-width=".25"
        fill-rule="evenodd"
      />
    {/each}
    {#each units as unit}
      {@const category = value(unit.properties, 'unit_category')}
      {#if !onExteriorChoose &&
        ['stairs', 'steps', 'escalator', 'elevator', 'ramp'].includes(category)}
        {@const status = facilityState(unit)}
        {@const anchor = projection.project(connectionAnchor(unit), floor)}
        <!-- biome-ignore lint/a11y/useSemanticElements: SVG facilities need keyboard-operable geometry rather than HTML buttons. -->
        <g
          role="button"
          tabindex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={`${value(unit.properties, 'unit_name_en')} — ${status}`}
          data-facility={value(unit.properties, 'unit_id')}
          data-state={status}
          class="cursor-pointer outline-none focus-visible:opacity-60"
          onpointermove={event => preview(unit, event)}
          onpointerleave={() => {
            hovered = null
          }}
          onclick={event => choose(unit, event)}
          onkeydown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (!disabled) onChoose(unit)
            }
          }}
        >
          <path
            d={projection.path(unit)}
            fill={colour(status)}
            stroke="white"
            stroke-width="0.5"
            fill-rule="evenodd"
          />
          <svg
            x={anchor[0] - iconSize / 2}
            y={anchor[1] - iconSize / 2}
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            pointer-events="none"
            aria-hidden="true"
          >
            <rect width="24" height="24" rx="5" fill="white" fill-opacity=".94" />
            <ConnectionFacilityIcon {category} class="text-slate-800" />
          </svg>
        </g>
      {/if}
    {/each}
    {#if exteriorPoint}
      {@const target = projection.project(exteriorPoint, floor)}
      <circle
        cx={target[0]}
        cy={target[1]}
        r={iconSize / 3}
        fill="#0891b2"
        stroke="white"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
        data-exterior-point
      />
    {/if}
    {#if selectedUnit}
      {#each entranceEdges(selectedUnit) as edge}
        {@const start = projection.project(edge.start, floor)}
        {@const end = projection.project(edge.end, floor)}
        <!-- biome-ignore lint/a11y/useSemanticElements: SVG edge overlays support direct pointer and keyboard entrance selection. -->
        <g
          role="button"
          tabindex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={`Select entrance side ${edge.side.polygonIndex + 1}.${edge.side.edgeIndex + 1}`}
          aria-pressed={sameSide(entrance, edge.side)}
          data-entrance-edge={`${edge.side.polygonIndex}.${edge.side.edgeIndex}`}
          class="cursor-pointer outline-none focus-visible:opacity-60"
          onpointermove={event => preview(selectedUnit, event)}
          onpointerleave={() => {
            hovered = null
          }}
          onclick={event => choose(selectedUnit, event)}
          onkeydown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (!disabled) onChoose(selectedUnit, edge.side)
            }
          }}
        >
          <line
            x1={start[0]}
            y1={start[1]}
            x2={end[0]}
            y2={end[1]}
            stroke="transparent"
            stroke-width="14"
            vector-effect="non-scaling-stroke"
          />
          <line
            x1={start[0]}
            y1={start[1]}
            x2={end[0]}
            y2={end[1]}
            stroke={sameSide(entrance, edge.side) ? '#0891b2' : '#64748b'}
            stroke-width={sameSide(entrance, edge.side) ? 5 : 1.5}
            vector-effect="non-scaling-stroke"
            pointer-events="none"
          />
        </g>
      {/each}
    {/if}
    {#if hovered && !disabled}
      {@const edge = entranceEdges(hovered.unit).find(edge =>
        sameSide(hovered?.side, edge.side),
      )}
      {#if edge}
        {@const start = projection.project(edge.start, floor)}
        {@const end = projection.project(edge.end, floor)}
        <line
          data-entrance-preview
          x1={start[0]}
          y1={start[1]}
          x2={end[0]}
          y2={end[1]}
          stroke="#facc15"
          stroke-width="5"
          vector-effect="non-scaling-stroke"
          pointer-events="none"
        />
      {/if}
    {/if}
  </svg>
  {#if !floor}
    <p
      class="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm"
    >
      Choose a floor to compare.
    </p>
  {/if}
</div>
