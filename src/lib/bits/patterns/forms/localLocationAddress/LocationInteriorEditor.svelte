<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
// API
import {
  getLocationInterior,
  saveLocationInterior,
} from '#lib/api/locationInterior.remote.js'
// DOMAIN
import {
  floorplanExtractionSchema,
  floorplanBundle,
  floorplanUnclassified,
  type FloorplanExtraction,
} from '#lib/indoor/floorplans/extraction.js'
import {
  auditFloor,
  drawnUnit,
  mergeUnits,
  splitUnit,
} from '#lib/indoor/floorplans/review.js'
import { StationState } from '#lib/indoor/station.svelte.js'
// COMPONENTS
import StationScene from '#lib/bits/patterns/station/StationScene.svelte'
import { Button } from '#lib/bits/core/index.js'
// ICONS
import LayersIcon from 'virtual:icons/lucide/layers'

let { locationId, isEditing }: { locationId: string; isEditing: boolean } = $props()
let current = $state<Awaited<ReturnType<typeof getLocationInterior>> | null>(null)
let extraction = $state<FloorplanExtraction | null>(null)
let jobId = $state('')
let pages = $state<string[]>([])
let floorIndex = $state(0)
let unitIndex = $state(-1)
let drawing = $state(false)
let vertexX = $state(0)
let vertexY = $state(0)
let vertices = $state<[number, number][]>([])
let mergeTarget = $state('')
let cutAxis = $state<'x' | 'y'>('x')
let cutCoordinate = $state(0)
let newFloorLabel = $state('')
let previewing = $state(false)
let failedJob = $state(false)
let replacementConfirmed = $state(false)
let draggedVertex = $state<number | null>(null)
let busy = $state(true)
let message = $state('')
let reviewed = $state(false)
let scene = $state<StationState | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const floor = $derived(extraction?.floors[floorIndex])
const residual = $derived.by(() => {
  if (!floor) return []
  try {
    return floorplanUnclassified(floor)
  } catch {
    return []
  }
})
const audit = $derived.by(() => {
  if (!floor || draggedVertex !== null || drawing) return null
  try {
    return auditFloor(floor)
  } catch {
    return { coverage: 0, issues: ['Repair the invalid polygon before saving.'] }
  }
})
const unit = $derived(floor?.units[unitIndex])
const base = $derived(
  '/api/locations/' + encodeURIComponent(locationId) + '/interior/jobs',
)

/** Load the existing standard indoor bundle. @returns Completion. */
async function refresh(): Promise<void> {
  const query = getLocationInterior({ locationId })
  await query.refresh()
  current = await query
  if (current.bundle) {
    const next = new StationState(() => null, false)
    next.loadDraft(current.bundle.data)
    next.floor = String(
      current.bundle.data.level_polygon.features[0]?.properties.level_id ?? '',
    )
    next.bearing = 0
    next.exploded = false
    scene = next
  }
}
$effect(() => {
  if (isEditing && !extraction && !busy && current?.review) {
    extraction = structuredClone($state.snapshot(current.review.extraction))
    pages = current.review.pages
    jobId = current.review.jobId
    reviewed = false
  }
})
onMount(() => {
  void (async () => {
    await refresh()
    const active = await fetch(base)
    if (active.ok) {
      const result = await active.json()
      if (result.id && result.id !== current?.review?.jobId) {
        jobId = result.id
        await poll()
        return
      }
    }
    busy = false
  })().catch(error => {
    message = String(error)
    busy = false
  })
})
onDestroy(() => {
  disposed = true
  clearTimeout(timer)
})
/** Poll the private extraction job, retaining its original source pages. @returns Completion. */
async function poll(): Promise<void> {
  try {
    const response = await fetch(base + '/' + jobId)
    if (!response.ok) throw new Error(await response.text())
    const result = await response.json()
    if (disposed) return
    if (result.status === 'needs-review') {
      extraction = floorplanExtractionSchema.parse(result.extraction)
      pages = result.pages
      busy = false
    } else if (result.status === 'failed') {
      failedJob = true
      throw new Error('Floor-plan extraction failed. Retry the retained source.')
    } else timer = setTimeout(() => void poll(), 3000)
  } catch (error) {
    message = String(error)
    busy = false
  }
}
/** Upload one bounded image or PDF for a review-only pass. @param file Original source. @returns Completion. */
async function upload(file?: File): Promise<void> {
  if (!file || busy) return
  if (file.size > 30 * 1024 * 1024) {
    message = 'Use a file smaller than 30 MiB.'
    return
  }
  busy = true
  message = ''
  failedJob = false
  reviewed = false
  try {
    const response = await fetch(base, { method: 'POST', body: file })
    if (!response.ok) throw new Error(await response.text())
    jobId = (await response.json()).id
    extraction = null
    floorIndex = 0
    unitIndex = -1
    await poll()
  } catch (error) {
    message = String(error)
    busy = false
  }
}
/** Add a source-page vertex while tracing a missing space. @param event Source SVG click. @returns Nothing. */
function addVertex(event: MouseEvent): void {
  if (!drawing || !floor) return
  const matrix = (event.currentTarget as SVGSVGElement).getScreenCTM()?.inverse()
  if (!matrix) return
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
  vertices.push([
    Math.max(0, Math.min(floor.width, point.x)),
    Math.max(0, Math.min(floor.height, point.y)),
  ])
}
/** Apply a review edit and invalidate the previous acknowledgement. @param action Geometry operation. @returns Nothing. */
function edit(action: () => void): void {
  try {
    action()
    reviewed = false
    message = ''
  } catch (error) {
    message = String(error)
  }
}
/** Preview reviewed geometry with its explicit floor transforms in the shared viewer. @returns Nothing. */
function preview(): void {
  if (!extraction) return
  edit(() => {
    const next = new StationState(() => null, false)
    next.loadDraft(floorplanBundle(extraction).data)
    scene = next
    previewing = true
  })
}
/** Duplicate a template only for an explicitly named physical floor. @returns Nothing. */
function assignFloor(): void {
  if (!floor || !extraction || !newFloorLabel.trim()) return
  edit(() => {
    const copy = structuredClone($state.snapshot(floor))
    copy.sourceFloorId = floor.sourceFloorId ?? floor.id
    copy.id = 'floor-' + crypto.randomUUID()
    copy.label = newFloorLabel.trim()
    extraction!.floors.push(copy)
    floorIndex = extraction!.floors.length - 1
    newFloorLabel = ''
    unitIndex = -1
  })
}
/** Move a reviewed polygon vertex in source-page coordinates. @param event Pointer on the source SVG. @returns Nothing. */
function moveVertex(event: PointerEvent): void {
  if (draggedVertex === null || !floor || !unit) return
  const svg = event.currentTarget as SVGSVGElement
  const matrix = svg.getScreenCTM()?.inverse()
  if (!matrix) return
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
  const coordinate: [number, number] = [
    Math.max(0, Math.min(floor.width, point.x)),
    Math.max(0, Math.min(floor.height, point.y)),
  ]
  unit.polygon[draggedVertex] = coordinate
  if (draggedVertex === 0) unit.polygon[unit.polygon.length - 1] = [...coordinate]
  reviewed = false
}
/** Save only explicitly reviewed geometry to the unpublished indoor draft. @returns Completion. */
async function save(): Promise<void> {
  if (!extraction || !reviewed) return
  busy = true
  try {
    await saveLocationInterior({
      locationId,
      jobId,
      extraction,
      reviewed: true,
      expectedVersion: current?.map?.draftVersion ?? 0,
    })
    await refresh()
    extraction = null
    message = 'Interior draft saved. It is ready to reopen or review for publication.'
  } catch (error) {
    message = String(error)
  } finally {
    busy = false
  }
}
</script>

<div class="flex min-h-0 flex-1 flex-col bg-white">
  {#if message}
    <p role="alert" class="text-error px-5 py-3 text-sm">{message}</p>
    {#if failedJob}
      <Button
        text="Retry extraction"
        disabled={busy}
        onClick={async () => {
          busy = true
          try {
            const response = await fetch(base + '/' + jobId, { method: 'POST' })
            if (!response.ok) throw new Error('Could not retry extraction.')
            failedJob = false
            message = ''
            await poll()
          } catch (error) {
            message = String(error)
            busy = false
          }
        }}
      />
    {/if}
  {/if}
  {#if isEditing && current?.canEdit}
    <div class="border-border flex flex-wrap items-center gap-4 border-b p-4">
      <label class="text-sm font-medium"
        >Upload floor plans
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          disabled={busy || (Boolean(current?.map?.draftHash) && !replacementConfirmed)}
          onchange={event => void upload(event.currentTarget.files?.[0])}
          class="ml-3 text-sm"
        >
      </label>
      {#if current?.map?.draftHash}
        <label class="flex items-center gap-2 text-sm"
          ><input type="checkbox" bind:checked={replacementConfirmed}>Start a
          replacement extraction for this draft</label
        >
      {/if}
      <span class="text-muted-foreground text-xs"
        >PDF, PNG or JPEG · up to 30 MiB · generated geometry requires review</span
      >
    </div>
  {/if}
  {#if busy}
    <div
      role="status"
      aria-label="Preparing interior map"
      class="grid min-h-96 flex-1 grid-cols-[1fr_18rem] gap-4 p-4"
    >
      <div class="bg-muted animate-pulse rounded-lg"></div>
      <div class="bg-muted animate-pulse rounded-lg"></div>
    </div>
  {:else if extraction && floor && isEditing && !previewing}
    <div class="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="min-h-96 overflow-auto bg-slate-100 p-3">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <!-- biome-ignore lint/a11y/useKeyWithClickEvents: Exact source coordinates can also be entered using the keyboard controls. -->
        <svg
          viewBox={'0 0 ' + floor.width + ' ' + floor.height}
          class="h-full min-h-96 w-full touch-none"
          onpointermove={moveVertex}
          onpointerup={() => (draggedVertex = null)}
          onpointercancel={() => (draggedVertex = null)}
          onpointerleave={() => (draggedVertex = null)}
          aria-label="Original floor plan with extraction overlay"
          role="img"
          onclick={addVertex}
        >
          <image
            href={base + '/' + jobId + '/' + pages[floor.page - 1]}
            width={floor.width}
            height={floor.height}
          />
          {#if vertices.length}
            <polyline
              points={vertices.map(point => point.join(',')).join(' ')}
              fill="none"
              stroke="#dc2626"
              stroke-width="3"
            />
          {/if}
          {#each residual as part}
            <path
              d={part
                .map(ring => 'M' + ring.map(point => point.join(',')).join('L') + 'Z')
                .join(' ')}
              fill="#f59e0b40"
              fill-rule="evenodd"
              stroke="#d97706"
              stroke-width="1"
            >
              <title>
                Unclassified space: walls or missing compartments; not a corridor
              </title>
            </path>
          {/each}
          {#each floor.units as part, index (part.id)}
            <polygon
              points={part.polygon.map(point => point.join(',')).join(' ')}
              fill={unitIndex === index ? '#f9731660' : '#0ea5e930'}
              stroke={unitIndex === index ? '#ea580c' : '#0284c7'}
              stroke-width="2"
            >
              <title>{part.label || part.category} · {part.evidence}</title>
            </polygon>
          {/each}
          {#if unit}
            {#each unit.polygon.slice(0, -1) as point, index}
              <!-- biome-ignore lint/a11y/useSemanticElements: SVG vertex handles cannot use HTML buttons; keyboard movement is provided. -->
              <circle
                cx={point[0]}
                cy={point[1]}
                r="5"
                fill="white"
                stroke="#ea580c"
                stroke-width="2"
                role="button"
                tabindex="0"
                aria-label={'Move polygon vertex ' + (index + 1) + ' with arrow keys'}
                onkeydown={event => {
                  const deltas: Record<string, number[]> = {
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0],
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                  }
                  const delta = deltas[event.key]
                  if (!delta) return
                  event.preventDefault()
                  const next: [number, number] = [
                    Math.max(0, Math.min(floor.width, point[0] + delta[0])),
                    Math.max(0, Math.min(floor.height, point[1] + delta[1])),
                  ]
                  unit.polygon[index] = next
                  if (index === 0) unit.polygon[unit.polygon.length - 1] = [...next]
                  reviewed = false
                }}
                onpointerdown={event => {
                  event.preventDefault()
                  draggedVertex = index
                }}
              >
                <title>Drag polygon vertex {index + 1}</title>
              </circle>
            {/each}
          {/if}
        </svg>
      </div>
      <div class="space-y-4 overflow-y-auto border-l p-4">
        <div class="flex flex-wrap gap-2">
          <Button
            text={drawing ? 'Cancel drawing' : 'Draw missing space'}
            onClick={() => {
              drawing = !drawing
              vertices = []
              unitIndex = -1
            }}
          />
          {#if drawing}
            <Button
              text="Finish polygon"
              disabled={vertices.length < 3}
              onClick={() =>
                edit(() => {
                  floor.units.push(drawnUnit(floor, vertices))
                  unitIndex = floor.units.length - 1
                  vertices = []
                  drawing = false
                })}
            />
          {/if}
          <Button text="Preview floors" onClick={preview} />
        </div>
        {#if drawing}
          <p class="text-sm">
            Click each corner on the source image, or enter its coordinates, then finish
            the polygon.
          </p>
          <div class="grid grid-cols-2 gap-2">
            <label
              >X<input
                type="number"
                min="0"
                max={floor.width}
                bind:value={vertexX}
                class="w-full rounded border p-2"
              ></label
            ><label
              >Y<input
                type="number"
                min="0"
                max={floor.height}
                bind:value={vertexY}
                class="w-full rounded border p-2"
              ></label
            >
          </div>
          <Button text="Add vertex" onClick={() => vertices.push([vertexX, vertexY])} />
        {/if}
        {#if audit}
          <p class="text-sm">Accounted area: {audit.coverage.toFixed(1)}%</p>
          {#each audit.issues as issue}
            <p class="text-sm text-amber-800">{issue}</p>
          {/each}
        {/if}
        <label class="grid gap-1 text-sm"
          >Floor plan
          <select
            bind:value={floorIndex}
            onchange={() => {
              unitIndex = -1
              drawing = false
              vertices = []
            }}
            class="rounded border p-2"
          >
            {#each extraction.floors as item, index}
              <option value={index}>{item.label || item.id}</option>
            {/each}
          </select>
        </label>
        <label class="grid gap-1 text-sm"
          >Floor label<input
            class="rounded border p-2"
            bind:value={floor.label}
            oninput={() => (reviewed = false)}
          ></label
        >
        <p class="text-muted-foreground text-xs">
          Review against the original. Typical plans remain templates; floor ranges and
          alignment need verification.
        </p>
        {#each [...extraction.warnings, ...floor.warnings] as warning}
          <p class="text-warning text-xs">{warning}</p>
        {/each}
        {#if residual.length}
          <p class="text-sm text-amber-800">
            Amber areas remain unclassified. They may be walls or missing compartments;
            they are not corridors.
          </p>
        {/if}
        <details class="space-y-3 rounded border p-3">
          <summary class="cursor-pointer text-sm font-medium">
            Floor assignment and alignment
          </summary>
          <label class="grid gap-1 text-sm"
            >New floor label<input
              aria-label="New floor label"
              bind:value={newFloorLabel}
              class="rounded border p-2"
            ></label
          >
          <Button
            text="Create floor from this template"
            disabled={!newFloorLabel.trim() || extraction.floors.length >= 24}
            onClick={assignFloor}
          />
          <p class="text-xs">
            Each copy retains its source diagram. Assign only floors confirmed by the
            plans.
          </p>
          {#if !floor.alignment}
            <Button
              text="Set floor alignment"
              onClick={() => {
                floor.alignment = { x: 0, y: 0, scale: 1, rotation: 0 }
                reviewed = false
              }}
            />
          {:else}
            <div class="grid grid-cols-2 gap-2">
              <label class="grid gap-1 text-sm"
                >X offset<input
                  type="number"
                  bind:value={floor.alignment.x}
                  oninput={() => (reviewed = false)}
                  class="w-full rounded border p-2"
                ></label
              >
              <label class="grid gap-1 text-sm"
                >Y offset<input
                  type="number"
                  bind:value={floor.alignment.y}
                  oninput={() => (reviewed = false)}
                  class="w-full rounded border p-2"
                ></label
              >
              <label class="grid gap-1 text-sm"
                >Scale<input
                  type="number"
                  min="0.001"
                  step="0.01"
                  bind:value={floor.alignment.scale}
                  oninput={() => (reviewed = false)}
                  class="w-full rounded border p-2"
                ></label
              >
              <label class="grid gap-1 text-sm"
                >Rotation<input
                  type="number"
                  min="-180"
                  max="180"
                  bind:value={floor.alignment.rotation}
                  oninput={() => (reviewed = false)}
                  class="w-full rounded border p-2"
                ></label
              >
            </div>
            <p class="text-xs">
              Offsets use shared map pixels from the diagram origin. Match known stair
              or lift anchors between floors and preview before saving.
            </p>
          {/if}
          <Button
            text="Remove this floor diagram"
            disabled={extraction.floors.length <= 1}
            onClick={() =>
              edit(() => {
                extraction!.floors.splice(floorIndex, 1)
                floorIndex = Math.max(0, floorIndex - 1)
                unitIndex = -1
              })}
          />
        </details>
        <ul class="space-y-1">
          {#each floor.units as part, index (part.id)}
            <li>
              <button
                type="button"
                class="hover:bg-muted w-full rounded p-2 text-left text-sm"
                onclick={() => (unitIndex = index)}
              >
                {part.label || part.category} · {Math.round(part.confidence * 100)}%
              </button>
            </li>
          {/each}
        </ul>
        {#if unit}
          <label class="grid gap-1 text-sm"
            >Part label<input
              class="rounded border p-2"
              bind:value={unit.label}
              oninput={() => (reviewed = false)}
            ></label
          >
          <p class="text-muted-foreground text-xs">{unit.evidence}</p>
          <p class="text-muted-foreground text-xs">
            Drag the highlighted vertices to correct the outline.
          </p>
          <label class="grid gap-1 text-sm"
            >Part type
            <select
              class="rounded border p-2"
              aria-label="Part type"
              bind:value={unit.category}
              onchange={() => (reviewed = false)}
            >
              {#each [
                'room',
                'corridor',
                'stairs',
                'elevator',
                'toilet',
                'kitchen',
                'lavatory',
                'balcony',
                'void',
                'unknown',
              ] as category}
                <option value={category}>{category}</option>
              {/each}
            </select>
          </label>
          <label class="grid gap-1 text-sm"
            >Merge with
            <select
              aria-label="Merge with"
              bind:value={mergeTarget}
              class="rounded border p-2"
            >
              <option value="">Choose adjacent space</option>
              {#each floor.units.filter(part => part.id !== unit.id) as part}
                <option value={part.id}>{part.label || part.id}</option>
              {/each}
            </select>
          </label>
          <Button
            text="Merge spaces"
            disabled={!mergeTarget}
            onClick={() =>
              edit(() => {
                const other = floor.units.find(part => part.id === mergeTarget)
                if (!other) return
                const merged = mergeUnits(unit, other)
                floor.units = floor.units
                  .filter(part => part.id !== other.id)
                  .map(part => (part.id === unit.id ? merged : part))
                unitIndex = floor.units.findIndex(part => part.id === merged.id)
                mergeTarget = ''
              })}
          />
          <div class="grid grid-cols-2 gap-2">
            <label class="grid gap-1 text-sm"
              >Cut direction<select bind:value={cutAxis} class="rounded border p-2">
                <option value="x">Vertical</option>
                <option value="y">Horizontal</option>
              </select></label
            >
            <label class="grid gap-1 text-sm"
              >Cut coordinate<input
                type="number"
                min="0"
                max="10000"
                bind:value={cutCoordinate}
                class="w-full rounded border p-2"
              ></label
            >
          </div>
          <Button
            text="Split space"
            onClick={() =>
              edit(() => {
                const parts = splitUnit(unit, cutAxis, cutCoordinate)
                floor.units.splice(unitIndex, 1, ...parts)
              })}
          />
          <Button
            text="Remove incorrect polygon"
            onClick={() => {
              floor.units.splice(unitIndex, 1)
              unitIndex = -1
              reviewed = false
            }}
          />
        {/if}
        <label class="flex gap-2 text-sm"
          ><input type="checkbox" bind:checked={reviewed}>I reviewed the extracted
          geometry and labels.</label
        >
        <Button text="Save interior draft" disabled={!reviewed} onClick={save} />
        <p class="text-muted-foreground text-xs">
          Saves an unpublished draft. Does not create building-part identities or
          navigation connections.
        </p>
      </div>
    </div>
  {:else if scene?.data}
    <div class="border-border flex items-center gap-3 border-b p-3">
      {#if previewing}
        <Button text="Back to review" onClick={() => (previewing = false)} />
      {/if}
      <Button
        text={scene.exploded ? 'Single floor' : 'Stack floors'}
        onClick={() => {
          if (scene) scene.exploded = !scene.exploded
        }}
      />
      <select
        aria-label="Interior floor"
        bind:value={scene.floor}
        class="rounded border p-2 text-sm"
      >
        {#each scene.data.level_polygon.features as level}
          <option value={String(level.properties.level_id)}>
            {String(level.properties.level_name_en)}
          </option>
        {/each}
      </select>
      {#if current?.map?.draftHash}
        <span class="text-muted-foreground text-xs">Interior draft</span>
      {/if}
      {#if current?.canEdit && current.map}
        <a class="text-sm underline" href={'/admin/premises-maps?map=' + current.map.id}
          >Map review and publication</a
        >
      {/if}
    </div>
    <div class="relative min-h-96 flex-1">
      <StationScene
        station={scene}
        data={scene.data}
        allowSelection={false}
        onSelect={() => {}}
      />
    </div>
  {:else}
    <div class="flex min-h-96 flex-1 items-center justify-center p-8">
      <div class="flex max-w-sm flex-col items-center gap-4 text-center">
        <LayersIcon class="text-primary size-16" />
        <h2 class="text-xl font-semibold">Building interior</h2>
        <p class="text-muted-foreground text-sm">
          {isEditing
            ? 'Upload a floor-plan image or PDF to begin.'
            : 'Choose Edit to upload floor plans and prepare an interior map.'}
        </p>
      </div>
    </div>
  {/if}
</div>
