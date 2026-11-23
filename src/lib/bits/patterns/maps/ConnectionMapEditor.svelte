<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import { SelectField } from '#lib/bits/custom/form/index.js'
// COMPONENTS
import ConnectionMapPane from './ConnectionMapPane.svelte'
import ConnectionFacilityIcon from './ConnectionFacilityIcon.svelte'
// DOMAIN
import {
  networkPairDirection,
  networkConnections,
  unmatchedNetworkConnectors,
} from '#lib/indoor/networkAnnotations.js'
import { stationProjection } from '#lib/indoor/scene.js'
import {
  connectionAnchor,
  suggestConnectionFloor,
  createEditorConnection,
  createExteriorConnection,
  nextConnectionDirection,
  setConnectionDirection,
  type EditorDirection,
} from '#lib/indoor/connectionEditor.js'
import { value } from '#lib/indoor/model.js'
// TYPES
import type { IndoorData, IndoorFeature } from '#lib/indoor/model.js'
import type {
  ExteriorEndpoint,
  EntranceSide,
  MapConnection,
} from '#lib/indoor/releases.js'

let {
  data,
  connections = $bindable(),
  disabled = false,
  onFloorsChange,
}: {
  data: IndoorData
  connections: MapConnection[]
  disabled?: boolean
  onFloorsChange?: (label: string) => void
} = $props()
let leftFloor = $state('')
let rightFloor = $state('')
let leftId = $state('')
let rightId = $state('')
let pendingExterior = $state<ExteriorEndpoint | null>(null)
const outside = $derived(rightFloor === '@exterior')
let pendingDirection = $state<EditorDirection>('both')
let pendingLeftEntrance = $state<EntranceSide | null>(null)
let pendingRightEntrance = $state<EntranceSide | null>(null)
let notice = $state('')
let suggestion = $state('')
let camera = $state({ x: 0, y: 0, size: 100 })
let fittedSize = $state(100)
const projection = $derived(stationProjection(data, false, { bearing: 0, tilt: 0 }))
const levels = $derived(data.level_polygon.features)
const facilities = $derived(
  data.unit_polygon.features.filter(unit =>
    ['stairs', 'steps', 'escalator', 'elevator', 'ramp'].includes(
      value(unit.properties, 'unit_category'),
    ),
  ),
)
const unmatched = $derived(unmatchedNetworkConnectors(data))
const unmatchedIndex = $derived(
  unmatched.findIndex(unit => value(unit.properties, 'unit_id') === leftId),
)
const left = $derived(
  facilities.find(unit => value(unit.properties, 'unit_id') === leftId),
)
const right = $derived(
  facilities.find(unit => value(unit.properties, 'unit_id') === rightId),
)
const viewBox = $derived([camera.x, camera.y, camera.size, camera.size].join(' '))
const pairIndex = $derived(
  connections.findIndex(
    c =>
      (c.from === leftId && c.to === rightId) ||
      (c.to === leftId && c.from === rightId),
  ),
)
const pair = $derived(pairIndex >= 0 ? connections[pairIndex] : undefined)

const sourceConnections = $derived(networkConnections({ ...data, connections }))
const sourcePair = $derived(
  sourceConnections.find(
    c =>
      (c.from === leftId && c.to === rightId) ||
      (c.to === leftId && c.from === rightId),
  ),
)
const visibleConnections = $derived([...connections, ...sourceConnections])
const related = $derived(
  visibleConnections.filter(c => c.from === leftId || c.to === leftId),
)
const floorItems = $derived(
  levels.map(level => ({
    value: value(level.properties, 'level_id'),
    label: value(level.properties, 'level_name_en'),
  })),
)
const sourceDirection = $derived(
  left && right && !outside ? networkPairDirection(data, left, right) : undefined,
)
const exterior = $derived(pair?.fromExterior ?? pair?.toExterior ?? pendingExterior)
const direction = $derived<EditorDirection>(
  pair
    ? pair.direction === null
      ? 'unknown'
      : pair.direction === 'both'
        ? 'both'
        : pair.from === leftId
          ? 'forward'
          : 'reverse'
    : pendingDirection,
)
const directionLabel = $derived(
  {
    both: 'Both ways',
    forward: 'Left to right',
    reverse: 'Right to left',
    unknown: 'Unknown — display only',
  }[direction],
)
const leftEntrance = $derived(
  pair
    ? ((pair.from === leftId ? pair.fromEntrance : pair.toEntrance) ?? null)
    : pendingLeftEntrance,
)
const rightEntrance = $derived(
  pair
    ? ((pair.from === rightId ? pair.fromEntrance : pair.toEntrance) ?? null)
    : pendingRightEntrance,
)

const compatible = $derived(
  !!left &&
    (outside
      ? !!leftEntrance &&
        (!!pendingExterior || !!pair?.fromExterior || !!pair?.toExterior)
      : !!right &&
        leftFloor !== rightFloor &&
        left.properties.unit_category === right.properties.unit_category),
)

// Report the visible floor context for the browser title without coupling camera state to it.
$effect(() => {
  const names = [leftFloor, rightFloor]
    .map(id =>
      id === '@exterior'
        ? 'Outside / street'
        : floorItems.find(item => item.value === id)?.label,
    )
    .filter(Boolean)
  onFloorsChange?.(names.join(' ↔ '))
})

/** Cycle direction and apply it directly to an existing draft pair. @returns Nothing. */
function cycleDirection(): void {
  if (!compatible || disabled) return
  const next = nextConnectionDirection(direction)
  if (pair)
    connections = connections.map((c, index) =>
      index === pairIndex ? setConnectionDirection(c, leftId, next) : c,
    )
  else pendingDirection = next
  notice = `Travel direction: ${{ both: 'Both ways', forward: 'Left to right', reverse: 'Right to left', unknown: 'Unknown — display only' }[next]}.`
}

/** Describe a facility in its floor context. @param unit Map facility. @returns Human-readable label. */
function label(unit: IndoorFeature): string {
  return [
    value(unit.properties, 'level_name_en'),
    value(unit.properties, 'unit_name_en') || value(unit.properties, 'unit_category'),
  ].join(' · ')
}
/** Fit the left floor while giving both panes the exact same XY viewport. @returns Nothing. */
function fit(): void {
  const floors = levels.filter(
    level => value(level.properties, 'level_id') === leftFloor,
  )
  if (!floors.length) return
  const box = projection.box(floors)
  const size = Math.max(box[2], box[3], 1) * 1.15
  fittedSize = size
  camera = {
    x: box[0] + box[2] / 2 - size / 2,
    y: box[1] + box[3] / 2 - size / 2,
    size,
  }
}
/** Focus a queued source mismatch while preserving both panes' shared XY camera.
 * @param index Position in the unmatched queue. @returns Nothing; no connection is created.
 */
function reviewUnmatched(index: number): void {
  const unit = unmatched[index]
  if (!unit || disabled) return
  leftFloor = value(unit.properties, 'level_id')
  fit()
  choose('left', unit)
  const box = projection.box([unit])
  const size = Math.max(Math.max(box[2], box[3], 1) * 3, fittedSize / 6)
  camera = {
    x: box[0] + box[2] / 2 - size / 2,
    y: box[1] + box[3] / 2 - size / 2,
    size,
  }
}
/** Suggest a destination without selecting or connecting its polygons. @param source Optional source facility. @returns Nothing. */
function suggest(source?: IndoorFeature): void {
  const point = source
    ? connectionAnchor(source)
    : projection.unproject(
        [camera.x + camera.size / 2, camera.y + camera.size / 2],
        leftFloor,
      )
  rightFloor = suggestConnectionFloor(
    data,
    leftFloor,
    point,
    source,
    visibleConnections,
  )
  suggestion = rightFloor
    ? 'Suggested floor · choose another if needed.'
    : 'No overlapping floor found at this position. Choose the right floor manually.'
  rightId = ''
  pendingExterior = null
}
/** Select a facility and optionally its nearest entrance without creating a pair.
 * @param side Pane. @param unit Facility. @param entrance Clicked outer edge, if supplied.
 * @returns Nothing. @remarks Repeated entrance clicks retain the other pane and its camera.
 */
function choose(
  side: 'left' | 'right',
  unit: IndoorFeature,
  entrance?: EntranceSide,
): void {
  if (disabled) return
  const id = value(unit.properties, 'unit_id')
  const changed = id !== (side === 'left' ? leftId : rightId)
  if (side === 'left') {
    if (changed) {
      leftId = id
      pendingLeftEntrance = null
      pendingRightEntrance = null
      pendingDirection = 'both'
      suggest(unit)
    }
    if (entrance) pendingLeftEntrance = entrance
  } else {
    if (changed) {
      pendingLeftEntrance = leftEntrance
      rightId = id
      pendingRightEntrance = null
      pendingDirection = left
        ? (networkPairDirection(data, left, unit) ?? 'both')
        : 'both'
    }
    if (entrance) pendingRightEntrance = entrance
  }
  if (pair && entrance) {
    // Entrance sides are attached to physical endpoints independently of travel direction.
    connections = connections.map((c, index) => {
      if (index !== pairIndex) return c
      const next = { ...c }
      if (side === 'right' && changed && pendingLeftEntrance)
        next[c.from === leftId ? 'fromEntrance' : 'toEntrance'] = pendingLeftEntrance
      next[c.from === id ? 'fromEntrance' : 'toEntrance'] = entrance
      return next
    })
  }
  notice = entrance ? 'Entrance selected. Save the draft when you are ready.' : ''
}
/** Find compatible endpoints without imposing one-link-per-facility restrictions. @param unit Candidate. @returns Whether a new pair can be made. */
function available(unit: IndoorFeature): boolean {
  const id = value(unit.properties, 'unit_id')
  return (
    !!left &&
    value(unit.properties, 'level_id') !== leftFloor &&
    unit.properties.unit_category === left.properties.unit_category &&
    !connections.some(
      c => (c.from === leftId && c.to === id) || (c.to === leftId && c.from === id),
    )
  )
}
/** Describe the visible connection state. @param unit Facility. @returns Legend state. */
function status(unit: IndoorFeature): string {
  const id = value(unit.properties, 'unit_id')
  if (id === leftId || id === rightId) return 'Selected'
  if (available(unit)) return 'Available'
  return visibleConnections.some(c => c.enabled && (c.from === id || c.to === id))
    ? 'Linked'
    : 'Unlinked'
}
/** Move both maps in source-aligned coordinates. @param x Horizontal delta. @param y Vertical delta. @returns Nothing. */
function pan(x: number, y: number): void {
  camera = { ...camera, x: camera.x + x, y: camera.y + y }
}
/** Zoom both panes around the same map coordinate. @param factor Scale multiplier. @param point Optional pointer anchor. @returns Nothing. */
function zoom(factor: number, point?: [number, number]): void {
  const size = Math.max(fittedSize / 20, Math.min(fittedSize * 4, camera.size * factor))
  const anchor = point ?? [camera.x + camera.size / 2, camera.y + camera.size / 2]
  const ratio = size / camera.size
  camera = {
    x: anchor[0] - (anchor[0] - camera.x) * ratio,
    y: anchor[1] - (anchor[1] - camera.y) * ratio,
    size,
  }
}
/** Add the explicitly selected pair or update its travel direction. @returns Nothing. */
function connect(): void {
  if (!left || !compatible || disabled) return
  if (outside && exterior) {
    const next = createExteriorConnection(left, exterior, leftEntrance, direction)
    connections = pair
      ? connections.map((c, index) =>
          index === pairIndex ? { ...next, enabled: c.enabled } : c,
        )
      : [...connections, next]
    rightId = next.from === leftId ? next.to : next.from
    notice = 'Exterior connection added. Save the draft when you are ready.'
    return
  }
  if (!right) return
  if (!['unknown', 'both', 'forward', 'reverse'].includes(direction)) return
  const next = createEditorConnection(left, right, direction)
  if (pair) {
    // Entrance sides remain attached to their physical endpoint when direction reverses.
    next.fromEntrance = pair.from === next.from ? pair.fromEntrance : pair.toEntrance
    next.toEntrance = pair.to === next.to ? pair.toEntrance : pair.fromEntrance
    next.enabled = pair.enabled
    connections = connections.map((c, index) => (index === pairIndex ? next : c))
  } else {
    next.fromEntrance =
      next.from === leftId ? pendingLeftEntrance : pendingRightEntrance
    next.toEntrance = next.to === rightId ? pendingRightEntrance : pendingLeftEntrance
    connections = [...connections, next]
  }
  notice = 'Connection updated. Save the draft when you are ready.'
}
/** Navigate to both endpoints of an existing connection. @param connection Stored pair. @returns Nothing. */
function inspect(connection: MapConnection): void {
  rightId = connection.from === leftId ? connection.to : connection.from
  rightFloor = connection.from === leftId ? connection.toLevel : connection.fromLevel
  pendingLeftEntrance = null
  pendingRightEntrance = null
  pendingExterior = connection.fromExterior ?? connection.toExterior ?? null
  pendingDirection =
    connection.direction === null
      ? 'unknown'
      : connection.direction === 'both'
        ? 'both'
        : connection.from === leftId
          ? 'forward'
          : 'reverse'
  suggestion =
    connection.evidence === 'source-network'
      ? 'Showing the source-network connection.'
      : 'Showing the recorded connection.'
}
// A fresh map starts fitted; choosing another floor retains the same camera in both panes.
$effect(() => {
  const first = levels[0]
  untrack(() => {
    if (!leftFloor && first) {
      leftFloor = value(first.properties, 'level_id')
      fit()
      suggest()
    }
  })
})
</script>

<section class="grid gap-3" aria-label="Floor connections">
  <section
    class="border-border bg-muted/30 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
    aria-label="Unmatched connectors"
  >
    <div class="min-w-0 flex-1 text-sm" aria-live="polite">
      <span class="font-medium"
        >{unmatchedIndex >= 0
          ? `${unmatchedIndex + 1} of ${unmatched.length} unmatched`
          : `${unmatched.length} unmatched`}</span
      >
      {#if unmatchedIndex >= 0 && left}
        <span class="text-muted-foreground ml-2 break-words"
          >{floorItems.find(item => item.value === leftFloor)?.label}
          ·
          {value(left.properties, 'unit_name_en') ||
            value(left.properties, 'unit_category')}
          · {leftId}</span
        >
      {:else}
        <span class="text-muted-foreground ml-2">No source-network match</span>
      {/if}
    </div>
    <Button
      text="Previous unmatched"
      style="ghost"
      size="sm"
      disabled={disabled || unmatchedIndex <= 0}
      onClick={() => reviewUnmatched(unmatchedIndex - 1)}
    />
    <Button
      text="Next unmatched"
      style="ghost"
      size="sm"
      disabled={disabled ||
        unmatched.length === 0 ||
        unmatchedIndex === unmatched.length - 1}
      onClick={() => reviewUnmatched(unmatchedIndex + 1)}
    />
  </section>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="text-muted-foreground text-sm">
      Click near a facility edge to select its entrance. Scroll to zoom; drag to move
      both plans.
    </p>
    <Button text="Fit floors" style="ghost" size="sm" onClick={fit} />
  </div>
  <div class="flex flex-wrap gap-x-5 gap-y-2 text-xs">
    {#each [
      { category: 'stairs', label: 'Stairs' },
      { category: 'escalator', label: 'Escalator' },
      { category: 'ramp', label: 'Ramp' },
      { category: 'elevator', label: 'Lift' },
    ] as item}
      <span class="flex items-center gap-1.5"
        ><ConnectionFacilityIcon category={item.category} class="size-5" />
        {item.label}</span
      >
    {/each}
    <span class="text-blue-600">● Linked</span
    ><span class="text-orange-600">● Unlinked</span>
    <span class="text-purple-600">● Selected</span
    ><span class="text-green-700">● Available</span>
  </div>
  <div class="relative grid grid-cols-2 gap-12">
    {#each ['left', 'right'] as side}
      <div class="grid min-w-0 content-start gap-3">
        <SelectField
          label={side === 'left' ? 'Left floor' : 'Right floor'}
          placeholder="Choose a floor"
          triggerAttrs={{
            'aria-label': side === 'left' ? 'Left floor' : 'Right floor',
          }}
          value={side === 'left' ? leftFloor : rightFloor}
          items={side === 'left'
            ? floorItems
            : [
                ...floorItems.filter(item => item.value !== leftFloor),
                { value: '@exterior', label: 'Outside / street' },
              ]}
          {disabled}
          onValueChange={next => {
            if (side === 'left') {
              leftFloor = next
              leftId = ''
              pendingLeftEntrance = null
              pendingRightEntrance = null
              pendingDirection = 'both'
              fit()
              suggest()
            } else {
              pendingLeftEntrance = leftEntrance
              rightFloor = next
              rightId = ''
              pendingExterior = null
              pendingRightEntrance = null
              pendingDirection = 'both'
              suggestion = 'Floor selected manually.'
            }
          }}
        />
        <ConnectionMapPane
          {data}
          {projection}
          {viewBox}
          {side}
          {disabled}
          floor={side === 'left' || outside ? leftFloor : rightFloor}
          exteriorPoint={side === 'right' && outside ? exterior?.point : undefined}
          onExteriorChoose={side === 'right' && outside
            ? point => {
                if (!left || disabled) return
                pendingExterior = { label: 'Outside / street', point }
                rightId = `exterior:${leftId}`
                if (pair)
                  connections = connections.map((c, index) =>
                    index === pairIndex
                      ? {
                          ...c,
                          ...(c.from === leftId
                            ? { toExterior: pendingExterior ?? undefined }
                            : { fromExterior: pendingExterior ?? undefined }),
                        }
                      : c,
                  )
              }
            : undefined}
          selected={side === 'left' ? leftId : rightId}
          entrance={side === 'left' ? leftEntrance : rightEntrance}
          state={status}
          onChoose={(unit, entrance) =>
            choose(side === 'left' ? 'left' : 'right', unit, entrance)}
          onPan={pan}
          onZoom={zoom}
        />
        <p class="min-h-5 text-sm">
          {side === 'left'
            ? left
              ? label(left)
              : 'Select the first facility.'
            : outside
              ? exterior
                ? 'Outside / street · point selected'
                : 'Click the plan to mark the exterior endpoint.'
              : right
                ? label(right)
                : 'Select the matching facility.'}
        </p>
      </div>
    {/each}

    <div class="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
      <Button
        text={`Travel direction: ${directionLabel}`}
        hideLabel
        modifier="circle"
        style="soft"
        color="primary"
        class="size-10!"
        disabled={disabled || !compatible}
        onClick={cycleDirection}
        attrs={{
          'data-direction': direction,
          'data-tooltip': `${directionLabel}. Click to change travel direction.`,
        }}
      >
        {#snippet icon()}
          <svg
            viewBox="0 0 24 24"
            class="size-6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            {#if direction === 'both'}
              <path d="M4 12h16M8 8l-4 4 4 4m8-8 4 4-4 4" />
            {:else if direction === 'forward'}
              <path d="M4 12h16m-5-5 5 5-5 5" />
            {:else if direction === 'reverse'}
              <path d="M20 12H4m5-5-5 5 5 5" />
            {:else}
              <path d="M8 8a4 4 0 1 1 7 2.6c-2 1-3 1.4-3 4M12 19v.1" />
            {/if}
          </svg>
        {/snippet}
      </Button>
    </div>
  </div>
  <p class="text-muted-foreground text-xs">
    {outside
      ? 'Select the facility entrance on the left and mark where it meets the exterior on the right.'
      : suggestion}
  </p>
  <div class="flex flex-wrap items-center gap-2">
    {#if sourceDirection}
      <span class="text-muted-foreground text-xs"
        >3D network:
        {sourceDirection === 'both'
          ? 'both ways'
          : sourceDirection === 'forward'
            ? 'left to right'
            : 'right to left'}</span
      >
      {#if pair && sourceDirection !== direction}
        <Button
          text="Use source direction"
          style="ghost"
          size="sm"
          {disabled}
          onClick={() => {
            if (sourceDirection)
              connections = connections.map((c, index) =>
                index === pairIndex
                  ? setConnectionDirection(c, leftId, sourceDirection)
                  : c,
              )
          }}
        />
      {/if}
    {/if}
    {#if compatible}
      {#if !pair}
        <Button
          text={sourcePair
            ? 'Save source connection as correction'
            : 'Connect selected facilities'}
          style="soft"
          color="primary"
          size="sm"
          {disabled}
          onClick={connect}
        />
      {/if}
      {#if pair}
        <Button
          text={pair.enabled ? 'Disable connection' : 'Enable connection'}
          style="outline"
          size="sm"
          {disabled}
          onClick={() => {
            connections = connections.map((c, index) =>
              index === pairIndex ? { ...c, enabled: !c.enabled } : c,
            )
          }}
        />
      {/if}
      <span class="text-muted-foreground text-xs">{directionLabel}</span>
    {:else if left && right}
      <p role="status" class="text-muted-foreground text-xs">
        Choose the same facility type on a different floor.
      </p>
    {/if}
    {#if left && related.length}
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground text-xs">Existing connections</span>
        {#each related as connection}
          {@const destination = floorItems.find(
            item =>
              item.value ===
              (connection.from === leftId ? connection.toLevel : connection.fromLevel),
          )}
          <Button
            text={(destination?.label ??
              (connection.fromExterior || connection.toExterior
                ? 'Outside / street'
                : 'Other floor')) +
              (connection.enabled ? '' : ' · Disabled') +
              (connection.evidence === 'source-network' ? ' · 3D network' : '')}
            style="outline"
            size="sm"
            onClick={() => inspect(connection)}
          />
        {/each}
      </div>
    {/if}
    {#if leftId || rightId}
      <Button
        text="Clear selection"
        style="ghost"
        size="sm"
        class="justify-self-start"
        onClick={() => {
          leftId = ''
          rightId = ''
          pendingLeftEntrance = null
          pendingRightEntrance = null
          pendingDirection = 'both'
          notice = ''
        }}
      />
    {/if}
  </div>
  {#if notice}
    <p role="status" class="sr-only">{notice}</p>
  {/if}
</section>
