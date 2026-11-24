<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
import { on } from 'svelte/events'
// API
import {
  getExteriorAlignment,
  saveExteriorAlignment,
} from '#lib/api/exteriorAlignment.remote.js'
// ICONS
import Lock from 'virtual:icons/lucide/lock'
import Unlock from 'virtual:icons/lucide/lock-open'
import Distribute from 'virtual:icons/lucide/align-vertical-distribute-center'
import Plus from 'virtual:icons/lucide/plus'
import Minus from 'virtual:icons/lucide/minus'
import ChevronLeft from 'virtual:icons/lucide/chevron-left'
import ChevronRight from 'virtual:icons/lucide/chevron-right'
// DOMAIN
import {
  addFloorLine,
  distributeFloorLines,
  facadeViews,
  floorLineLabel,
  validFloorDesignation,
  type FloorDesignation,
  moveFloorLine,
  removeFloorLine,
  type FloorLine,
} from '#lib/locations/exterior/floorAlignment.js'
// TYPES
import type { ModelViewerElement } from '@google/model-viewer'
import type { FacadeAnalysis } from '#lib/locations/exterior/facades.js'
let {
  active,
  viewer,
  assetId,
  comparisonGeometry = false,
  sourceAssetId,
  locationId,
  canSave,
}: {
  active: boolean
  viewer: ModelViewerElement
  assetId: string
  sourceAssetId: string
  locationId: string
  canSave: boolean
  comparisonGeometry?: boolean
} = $props()
let result = $state<FacadeAnalysis | null>(null)
let failure = $state('')
let lines = $state<FloorLine[]>([])
let side = $state(0)
let front = $state(0)
let transparent = $state(false)
let frame = $state({ left: 80, right: 400, top: 120, bottom: 500 })
let projected = $state(false)
type Snapshot = { lines: FloorLine[]; front: number }
let beforeRename: Snapshot | undefined
let history = $state.raw<Snapshot[]>([])
let version = $state(0)
let saving = $state(false)
let saveError = $state('')
let baseline = $state('')
let ready = $state(false)
const identity = $derived({ locationId, assetId: sourceAssetId, geometryId: assetId })
const dirty = $derived(snapshotKey({ lines, front }) !== baseline)

let editingFloor = $state<string | null>(null)
const editedLine = $derived(lines.find(line => line.id === editingFloor))
const editedNumber = $derived(
  editedLine?.designation?.number ??
    Math.max(
      1,
      lines.findIndex(line => line.id === editingFloor),
    ),
)
const views = $derived(facadeViews(result?.facades ?? []))
const face = $derived(views[side])
// Camera offsets are fractions of the current face's width and model height.
const fitted = { zoom: 1, x: 0, y: 0 }
let cameras = $state<Record<string, typeof fitted>>({})
const camera = $derived(cameras[face?.id] ?? fitted)
const maxZoom = 4
const bounds = $derived<[number, number]>(
  views.length
    ? [
        Math.min(...views.map(view => view.bottom)),
        Math.max(...views.map(view => view.top)),
      ]
    : [0, 1],
)
const storageKey = $derived(
  `hype-facade-alignment:${locationId}:${sourceAssetId}:${assetId}`,
)
let anchors: HTMLElement[] = []
let worker: Worker | undefined

/** Keep the selected point on the façade reachable when zooming or panning.
 * @param zoom Magnification relative to fit. @param x Horizontal target offset.
 * @param y Vertical target offset (positive upwards). @returns Nothing.
 */
function setCamera(zoom: number, x: number, y: number): void {
  const limit = (1 - 1 / zoom) / 2
  cameras[face.id] = {
    zoom,
    x: Math.min(limit, Math.max(-limit, x)),
    y: Math.min(limit, Math.max(-limit, y)),
  }
}

/** Zoom about the cursor or, for the toolbar, the centre of the view.
 * @param factor Multiplicative zoom step. @param pointer Optional wheel position. @returns Nothing.
 */
function zoomBy(factor: number, pointer?: WheelEvent): void {
  const zoom = Math.min(maxZoom, Math.max(1, camera.zoom * factor))
  if (zoom === camera.zoom) return
  const rect = viewer.getBoundingClientRect()
  const shift = 1 - camera.zoom / zoom
  const dx = pointer
    ? (pointer.clientX - rect.left - rect.width / 2) / (frame.right - frame.left)
    : 0
  const dy = pointer
    ? (rect.top + rect.height / 2 - pointer.clientY) / (frame.bottom - frame.top)
    : 0
  setCamera(zoom, camera.x + dx * shift, camera.y + dy * shift)
}

/** Handle canvas gestures while leaving floor handles available for editing.
 * @param node Clipped façade viewport. @returns Listener cleanup.
 */
function navigate(node: HTMLElement): { destroy(): void } {
  const wheel = on(
    node,
    'wheel',
    event => {
      if (!event.deltaY || !projected) return
      event.preventDefault()
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1
      zoomBy(Math.exp(-event.deltaY * unit * 0.002), event)
    },
    { passive: false },
  )
  const down = on(node, 'pointerdown', event => {
    if (
      event.target !== node ||
      event.button !== 0 ||
      !event.isPrimary ||
      camera.zoom === 1
    )
      return
    const { zoom, x, y } = camera
    const width = frame.right - frame.left
    const height = frame.bottom - frame.top
    node.setPointerCapture(event.pointerId)
    const move = on(node, 'pointermove', next => {
      if (next.pointerId !== event.pointerId) return
      setCamera(
        zoom,
        x - (next.clientX - event.clientX) / width,
        y + (next.clientY - event.clientY) / height,
      )
    })
    on(node, 'lostpointercapture', () => move(), { once: true })
  })
  return {
    destroy() {
      wheel()
      down()
    },
  }
}

/** Establish the straight-on camera at the selected zoom and pan. @returns Nothing. */
function orient(): void {
  if (!active || !face || !anchors.length) return
  const middle = (bounds[0] + bounds[1]) / 2
  const offset = camera.x * face.width
  const elevation = middle + camera.y * (bounds[1] - bounds[0])
  viewer.cameraTarget = `${face.centre[0] + offset * face.right[0]}m ${elevation}m ${face.centre[2] + offset * face.right[2]}m`
  viewer.minFieldOfView = '10deg'
  viewer.maxFieldOfView = '10deg'
  viewer.fieldOfView = '10deg'
  viewer.interpolationDecay = 0
  const aspect = Math.max(0.2, viewer.clientWidth / Math.max(1, viewer.clientHeight))
  const distance =
    (Math.max(bounds[1] - bounds[0], face.width / aspect) /
      (2 * Math.tan(Math.PI / 36))) *
    1.45
  const theta = (Math.atan2(face.normal[0], face.normal[2]) * 180) / Math.PI
  viewer.minCameraOrbit = 'auto auto 0.01m'
  viewer.maxCameraOrbit = `auto auto ${distance * 2}m`
  viewer.cameraOrbit = `${theta}deg 90deg ${distance / camera.zoom}m`
  void viewer.updateComplete.then(() => viewer.jumpCameraToGoal())
}

/** Establish four world-space anchors for the interactive overlay. @returns Nothing. */
function placeAnchors(): void {
  if (!active || !face || !anchors.length) return
  projected = false
  const positions = [
    [-1, bounds[1]],
    [1, bounds[1]],
    [-1, bounds[0]],
    [1, bounds[0]],
  ]
  positions.forEach(([direction, elevation], i) => {
    const x = face.centre[0] + (face.right[0] * face.width * direction) / 2
    const z = face.centre[2] + (face.right[2] * face.width * direction) / 2
    viewer.updateHotspot({
      name: anchors[i].slot,
      position: `${x}m ${elevation}m ${z}m`,
      normal: face.normal.join(' '),
    })
  })
}

/** Map one model elevation to overlay pixels. @param elevation Model Y. @returns Canvas Y. */
function lineY(elevation: number): number {
  return (
    frame.bottom -
    ((elevation - bounds[0]) / (bounds[1] - bounds[0])) * (frame.bottom - frame.top)
  )
}
/** Move a boundary directly; redistribution remains an explicit separate action. @param event Pointer input. @param id Boundary identity. @returns Nothing. */
function drag(event: PointerEvent, id: string): void {
  const line = lines.find(line => line.id === id)
  if (!line || line.locked) return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  const before = snapshot()
  const start = line.elevation
  const startY = event.clientY
  const scale = (bounds[1] - bounds[0]) / (frame.bottom - frame.top)
  const move = (next: PointerEvent) => {
    lines = moveFloorLine(lines, id, start - (next.clientY - startY) * scale, bounds)
  }
  const end = () => {
    if (lines.find(item => item.id === id)?.elevation !== start) remember(before)
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', end)
    target.removeEventListener('pointercancel', end)
    target.removeEventListener('lostpointercapture', end)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', end)
  target.addEventListener('pointercancel', end)
  target.addEventListener('lostpointercapture', end)
}
/** Name the two boundary anchors distinctly from intermediate floor lines. @param index Ordered boundary index. @returns Visible label. */
function label(index: number): string {
  return floorLineLabel(lines[index], index, lines.length)
}

/** Change floor identity independently of its height or lock.
 * @param type Floor category. @param number Positive floor number. @returns Nothing.
 */
function designate(type: FloorDesignation['type'], number: number): void {
  const designation = { ...editedLine?.designation, type, number }
  if (!validFloorDesignation(designation)) return
  edit(lines.map(line => (line.id === editingFloor ? { ...line, designation } : line)))
}

/** Set a team-defined label without changing floor category, height or identity.
 * @param name Free-form floor name; blank restores the generated label. @returns Nothing.
 */
function renameFloor(name: string): void {
  lines = lines.map(line =>
    line.id === editingFloor
      ? {
          ...line,
          designation: {
            type: 'floor',
            number: editedNumber,
            ...line.designation,
            name,
          },
        }
      : line,
  )
}

/** Compare persisted fields independent of the JSON property order. @param state Reviewed alignment. @returns Stable edit signature. */
function snapshotKey(state: Snapshot): string {
  return JSON.stringify([
    state.front,
    ...state.lines.map(line => [
      line.id,
      line.elevation,
      line.locked,
      line.designation?.type,
      line.designation?.number,
      line.designation?.name,
    ]),
  ])
}
/** Capture one undo step before mutating the reviewed model. @returns Independent snapshot. */
function snapshot(): Snapshot {
  return { lines: $state.snapshot(lines), front }
}
/** Add one completed action to the undo history. @param before Previous boundaries and front. */
function remember(before: Snapshot): void {
  history = [...history.slice(-99), before]
  saveError = ''
}
/** Apply a discrete editing action. @param next New floor boundaries. @param nextFront New front index. */
function edit(next: FloorLine[], nextFront = front): void {
  if (nextFront === front && JSON.stringify(next) === JSON.stringify(lines)) return
  remember(snapshot())
  lines = next
  front = nextFront
}
/** Restore the last complete edit, including a full pointer drag. @returns Nothing. */
function undo(): void {
  const previous = history.at(-1)
  if (!previous) return
  history = history.slice(0, -1)
  lines = previous.lines
  if (front !== previous.front) side = previous.front
  front = previous.front
  editingFloor = null
  saveError = ''
}
/** Store an attributed revision for this geometry. @returns Completion of the database write. */
async function save(): Promise<void> {
  if (!ready || saving || !canSave) return
  const captured = snapshot()
  saving = true
  saveError = ''
  try {
    const saved = await saveExteriorAlignment({
      ...identity,
      expectedRevision: version,
      alignment: { lines: captured.lines, frontViewId: views[captured.front].id },
    })
    version = saved.revision
    baseline = snapshotKey(captured)
  } catch (cause) {
    saveError =
      cause instanceof Error
        ? cause.message
        : 'Could not save the alignment. Your edits are still here.'
  } finally {
    saving = false
  }
}
// Keep a recoverable device draft. The shared model changes only on Save model.
$effect(() => {
  if (!ready || !canSave) return
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ lines, front, side, baseRevision: version }),
    )
  } catch {
    /* Browser storage is optional. Database Save remains available. */
  }
})

onMount(() => {
  let disposed = false
  const controller = new AbortController()
  const orbitSettings = {
    cameraOrbit: viewer.cameraOrbit,
    cameraTarget: viewer.cameraTarget,
    minCameraOrbit: viewer.minCameraOrbit,
    maxCameraOrbit: viewer.maxCameraOrbit,
    fieldOfView: viewer.fieldOfView,
    minFieldOfView: viewer.minFieldOfView,
    maxFieldOfView: viewer.maxFieldOfView,
    interpolationDecay: viewer.interpolationDecay,
  }
  let animation = 0
  const materials = (viewer.model?.materials ?? [])
    .filter(material => material.isLoaded)
    .map(material => ({
      material,
      color: [...material.pbrMetallicRoughness.baseColorFactor] as [
        number,
        number,
        number,
        number,
      ],
      mode: material.getAlphaMode(),
    }))
  const applyTransparency = () => {
    const translucent = active && transparent
    for (const { material, color, mode } of materials) {
      material.setAlphaMode(translucent ? 'BLEND' : mode)
      material.pbrMetallicRoughness.setBaseColorFactor([
        color[0],
        color[1],
        color[2],
        translucent ? color[3] * 0.5 : color[3],
      ])
    }
  }
  anchors = [0, 1, 2, 3].map(index => {
    const element = document.createElement('span')
    element.slot = `hotspot-alignment-${index}`
    element.dataset.position = '0m 0m 0m'
    element.style.pointerEvents = 'none'
    element.setAttribute('aria-hidden', 'true')
    viewer.append(element)
    return element
  })
  // Projection follows model-viewer's actual camera so the floor handles stay on the geometry.
  const project = () => {
    const positions = anchors.map(
      anchor => viewer.queryHotspot(anchor.slot)?.canvasPosition,
    )
    if (positions.every(Boolean)) {
      const [a, b, c, d] = positions as { x: number; y: number }[]
      const next = {
        left: Math.min(a.x, b.x),
        right: Math.max(a.x, b.x),
        top: (a.y + b.y) / 2,
        bottom: (c.y + d.y) / 2,
      }
      if (next.bottom - next.top > 1 && next.right - next.left > 1) {
        if (
          Object.keys(next).some(
            key =>
              Math.abs(
                next[key as keyof typeof next] - frame[key as keyof typeof frame],
              ) > 0.2,
          )
        )
          frame = next
        projected = true
      }
    }
    animation = requestAnimationFrame(project)
  }
  const stopReview = $effect.root(() => {
    $effect(applyTransparency)
    $effect(() => {
      if (!active) return
      // The editor owns the camera and projection loop only while the facade is visible.
      viewer.autoRotate = false
      viewer.cameraControls = false
      viewer.resetTurntableRotation()
      const resize = new ResizeObserver(orient)
      resize.observe(viewer)
      animation = requestAnimationFrame(project)
      return () => {
        cancelAnimationFrame(animation)
        resize.disconnect()
        Object.assign(viewer, orbitSettings)
        viewer.cameraControls = true
        viewer.autoRotate = true
      }
    })
    $effect(placeAnchors)
    $effect(orient)
  })
  void (async () => {
    try {
      // Exporting KHR_materials_variants activates each variant on the live meshes.
      // The immutable comparison GLB already contains the exact geometry for the worker.
      let blob: Blob
      if (comparisonGeometry && viewer.src) {
        const response = await fetch(viewer.src, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load comparison geometry.')
        blob = await response.blob()
      } else {
        blob = await viewer.exportScene({
          binary: true,
          onlyVisible: true,
          maxTextureSize: 1,
        })
      }
      if (disposed) return
      if (blob.size > 256 * 1024 * 1024)
        throw new Error('Model is too large for browser analysis.')
      const buffer = await blob.arrayBuffer()
      if (disposed) return
      worker = new Worker(
        new URL('../../../../locations/exterior/facades.worker.ts', import.meta.url),
        { type: 'module' },
      )
      worker.onmessage = async event => {
        if (disposed) return
        if (event.data.error) {
          failure = event.data.error
          worker?.terminate()
          return
        }
        const analysis: FacadeAnalysis = event.data.result
        const nextViews = facadeViews(analysis.facades)
        if (!nextViews.length) {
          failure = 'No vertical façades were detected in this model.'
          worker?.terminate()
          return
        }
        const low = Math.min(...nextViews.map(view => view.bottom)),
          high = Math.max(...nextViews.map(view => view.top))
        const elevations = [
          ...new Set([
            low,
            ...analysis.floors
              .map(floor => floor.elevation)
              .filter(value => value > low && value < high),
            high,
          ]),
        ].sort((a, b) => a - b)
        let initial: FloorLine[] = elevations.map((elevation, i) => ({
          id: `line-${i}`,
          elevation,
          locked: false,
        }))
        // Start comparisons facing the largest corrected area, then honor any saved front.
        if (comparisonGeometry) {
          front = nextViews.reduce(
            (best, view, index) =>
              view.comparisonArea > nextViews[best].comparisonArea ? index : best,
            0,
          )
          side = front
        }
        let persisted: Awaited<ReturnType<typeof getExteriorAlignment>>
        try {
          const query = getExteriorAlignment(identity)
          await query.refresh()
          persisted = await query
        } catch {
          if (!disposed)
            failure = 'Could not load the saved alignment. Reload to try again.'
          return
        }
        if (disposed) return
        if (persisted) {
          const index = nextViews.findIndex(view => view.id === persisted.frontViewId)
          if (
            index < 0 ||
            persisted.lines.some(line => line.elevation < low || line.elevation > high)
          ) {
            failure = 'The saved alignment does not fit this geometry.'
            return
          }
          version = persisted.revision
          initial = persisted.lines
          front = index
          side = index
        }
        baseline = snapshotKey({ lines: initial, front })
        try {
          const saved = JSON.parse(
            localStorage.getItem(storageKey) ??
              localStorage.getItem(`hype-facade-alignment:${assetId}`) ??
              'null',
          )
          if (
            (saved?.baseRevision ?? 0) === version &&
            Array.isArray(saved?.lines) &&
            saved.lines.length >= 2 &&
            saved.lines.length <= 301 &&
            new Set(saved.lines.map((line: FloorLine) => line.id)).size ===
              saved.lines.length &&
            saved.lines.every(
              (line: FloorLine, i: number) =>
                typeof line.id === 'string' &&
                typeof line.locked === 'boolean' &&
                validFloorDesignation(line.designation) &&
                Number.isFinite(line.elevation) &&
                line.elevation >= low &&
                line.elevation <= high &&
                (i === 0 || line.elevation > saved.lines[i - 1].elevation),
            )
          ) {
            initial = saved.lines
            if (
              Number.isInteger(saved.front) &&
              saved.front >= 0 &&
              saved.front < nextViews.length
            ) {
              front = saved.front
              side = saved.front
            }
          }
        } catch {
          /* Invalid or unavailable local preferences leave the inferred boundaries intact. */
        }
        lines = initial
        ready = true
        result = analysis
        worker?.terminate()
      }
      worker.onerror = () => {
        failure = 'Could not analyse the exterior model.'
        worker?.terminate()
      }
      worker.postMessage({ buffer, assetId, floors: [], storeyHeight: 3 }, [buffer])
    } catch (cause) {
      if (!disposed)
        failure =
          cause instanceof Error ? cause.message : 'Could not analyse the model.'
    }
  })()
  return () => {
    disposed = true
    controller.abort()
    worker?.terminate()
    stopReview()
    for (const { material, color, mode } of materials) {
      material.setAlphaMode(mode)
      material.pbrMetallicRoughness.setBaseColorFactor(color)
    }
    for (const anchor of anchors) anchor.remove()
  }
})
</script>

<section
  hidden={!active}
  aria-label="Visual façade floor alignment"
  class="pointer-events-none absolute inset-0 z-10 overflow-clip"
>
  {#if failure}
    <p
      role="alert"
      class="bg-background pointer-events-auto absolute inset-x-4 top-4 rounded border p-4"
    >
      {failure}
    </p>
  {:else if !result}
    <div
      role="status"
      aria-label="Detecting façade directions"
      class="bg-muted absolute inset-x-4 top-4 h-12 animate-pulse rounded"
    ></div>
  {:else}
    <div
      class="pointer-events-auto absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2"
    >
      <div class="bg-panel/95 flex items-center gap-2 rounded-xl border p-1 shadow-sm">
        <button
          type="button"
          aria-label="Previous façade"
          class="grid size-10 place-items-center rounded-lg"
          disabled={views.length < 2}
          onclick={() => (side = (side + views.length - 1) % views.length)}
        >
          <ChevronLeft class="size-5" />
        </button>
        <span class="text-sm font-medium"
          >{side === front ? 'Front' : `Façade ${side + 1}`}
          <span class="text-muted-foreground">{side + 1}/{views.length}</span></span
        >
        <button
          type="button"
          aria-label="Next façade"
          class="grid size-10 place-items-center rounded-lg"
          disabled={views.length < 2}
          onclick={() => (side = (side + 1) % views.length)}
        >
          <ChevronRight class="size-5" />
        </button>
        {#if side !== front}
          <button
            type="button"
            class="min-h-10 px-2 text-sm"
            onclick={() => edit(lines, side)}
          >
            Set as front
          </button>
        {/if}
      </div>
      <div
        class="bg-panel/95 flex flex-wrap items-center gap-1 rounded-xl border p-1 shadow-sm"
      >
        <label class="flex min-h-9 items-center gap-2 px-2 text-sm">
          <input type="checkbox" bind:checked={transparent}>50% transparent
        </label>
        <button
          type="button"
          class="min-h-9 px-2 text-sm disabled:opacity-40"
          disabled={!history.length}
          onclick={undo}
        >
          Undo
        </button>
        <button
          type="button"
          aria-label="Evenly distribute"
          title="Evenly distribute unlocked lines between fixed anchors"
          class="grid size-10 place-items-center rounded-lg"
          onclick={() => edit(distributeFloorLines(lines))}
        >
          <Distribute class="size-5" />
        </button>
        <button
          type="button"
          aria-label="Add floor"
          class="flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm"
          disabled={lines.length >= 100}
          onclick={() => edit(addFloorLine(lines, crypto.randomUUID()))}
        >
          <Plus class="size-5" />Add floor
        </button>
        {#if canSave}
          <button
            type="button"
            class="bg-primary text-primary-content min-h-9 rounded-lg px-3 text-sm disabled:opacity-50"
            disabled={saving || (version > 0 && !dirty)}
            onclick={save}
          >
            Save model
          </button>
          <span role="status" class="text-muted-foreground px-1 text-xs"
            >{saving
              ? 'Saving…'
              : dirty
                ? 'Unsaved changes'
                : version
                  ? 'Saved · r' + version
                  : ''}</span
          >
        {/if}
      </div>
    </div>
    {#if editedLine}
      <div
        class="bg-panel pointer-events-auto absolute inset-x-3 top-16 z-20 flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-sm"
      >
        <label class="grid min-w-0 flex-1 gap-1 text-xs"
          >Floor name (optional)
          <input
            aria-label="Floor name"
            class="min-w-0 rounded border p-2"
            type="text"
            placeholder="e.g. LG2, Mezzanine, 12A, 天台"
            value={editedLine.designation?.name ?? ''}
            maxlength="1000"
            onfocus={() => (beforeRename = snapshot())}
            oninput={event => renameFloor(event.currentTarget.value)}
            onblur={() => {
              if (
                beforeRename &&
                snapshotKey(beforeRename) !== snapshotKey({ lines, front })
              )
                remember(beforeRename)
              beforeRename = undefined
            }}
          >
          <span>Leave blank to use the type and number.</span>
        </label>
        <label class="grid gap-1 text-xs"
          >Floor type
          <select
            aria-label="Floor type"
            class="rounded border p-2 pr-8"
            value={editedLine.designation?.type ?? 'floor'}
            onchange={event =>
              designate(
                event.currentTarget.value as FloorDesignation['type'],
                editedNumber,
              )}
          >
            <option value="basement">Basement</option>
            <option value="ground">Ground floor</option>
            <option value="floor">Numbered floor</option>
          </select>
        </label>
        {#if editedLine.designation?.type !== 'ground'}
          <label class="grid gap-1 text-xs"
            >Floor number
            <input
              aria-label="Floor number"
              class="w-24 rounded border p-2"
              type="number"
              min="1"
              max="999"
              step="1"
              value={editedNumber}
              onchange={event =>
                designate(
                  editedLine?.designation?.type ?? 'floor',
                  event.currentTarget.valueAsNumber,
                )}
            >
          </label>
        {/if}
        <button
          type="button"
          class="rounded border px-3 py-2"
          onclick={() => (editingFloor = null)}
        >
          Done
        </button>
        <p class="w-full text-xs">
          Names the floor above this line. Changing its name does not move any lines.
        </p>
      </div>
    {/if}
    <div
      class={[
        'pointer-events-auto absolute inset-0',
        camera.zoom > 1 && 'cursor-grab touch-none active:cursor-grabbing',
      ]}
      use:navigate
    >
      {#if projected}
        {#each lines as line, index (line.id)}
          <div
            class="absolute"
            style:left={`${frame.left}px`}
            style:top={`${lineY(line.elevation)}px`}
            style:width={`${frame.right - frame.left}px`}
          >
            <button
              type="button"
              aria-label={`${line.locked ? 'Unlock' : 'Lock'} ${label(index)}`}
              aria-pressed={line.locked}
              class="bg-panel/95 pointer-events-auto absolute top-0 right-full mr-2 grid size-7 -translate-y-1/2 place-items-center rounded border text-blue-600 shadow-sm"
              onclick={() =>
                edit(
                  lines.map(item =>
                    item.id === line.id ? { ...item, locked: !item.locked } : item,
                  ),
                )}
            >
              {#if line.locked}
                <Lock class="size-4" />
              {:else}
                <Unlock class="size-4" />
              {/if}
            </button>
            {#if index > 0 && index < lines.length - 1}
              <button
                type="button"
                aria-label={`Remove ${label(index)}`}
                title={line.locked
                  ? 'Unlock this floor before removing it'
                  : `Remove ${label(index)}`}
                disabled={line.locked}
                class="bg-panel/95 pointer-events-auto absolute top-0 left-full ml-2 grid size-7 -translate-y-1/2 place-items-center rounded border text-blue-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                onclick={() => edit(removeFloorLine(lines, line.id))}
              >
                <Minus class="size-4" />
              </button>
            {/if}
            <button
              type="button"
              aria-label={`Drag ${label(index)}`}
              aria-disabled={line.locked}
              class="pointer-events-auto absolute inset-x-0 top-0 h-6 -translate-y-1/2 cursor-ns-resize touch-none outline-offset-4 disabled:cursor-default"
              disabled={line.locked}
              onpointerdown={event => drag(event, line.id)}
              onkeydown={event => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  edit(
                    moveFloorLine(
                      lines,
                      line.id,
                      line.elevation +
                        (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 1 : 0.1),
                      bounds,
                    ),
                  )
                }
              }}
            >
              <span
                class="absolute inset-x-0 top-1/2 h-0.5 bg-blue-500 shadow-sm"
              ></span>
            </button>
            <button
              type="button"
              aria-label={`Edit ${label(index)} designation`}
              class="bg-panel/95 pointer-events-auto absolute top-0 left-2 max-w-full -translate-y-1/2 rounded px-2 py-1 text-xs break-words whitespace-normal text-blue-700"
              disabled={index === lines.length - 1}
              onclick={() => (editingFloor = line.id)}
            >
              {label(index)}
            </button>
          </div>
        {/each}
      {/if}
    </div>
    <fieldset
      aria-label="Façade zoom"
      class="bg-panel/95 pointer-events-auto absolute right-3 bottom-3 flex items-center rounded-xl border p-1 shadow-sm"
    >
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        class="grid size-9 place-items-center rounded-lg disabled:opacity-40"
        disabled={camera.zoom === 1}
        onclick={() => zoomBy(1 / 1.25)}
      >
        <Minus class="size-4" />
      </button>
      <button
        type="button"
        aria-label="Fit façade to view"
        title="Fit façade to view"
        class="min-h-9 w-14 rounded-lg text-sm tabular-nums"
        onclick={() => setCamera(1, 0, 0)}
      >
        {Math.round(camera.zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        class="grid size-9 place-items-center rounded-lg disabled:opacity-40"
        disabled={camera.zoom === maxZoom}
        onclick={() => zoomBy(1.25)}
      >
        <Plus class="size-4" />
      </button>
    </fieldset>
    {#if saveError}
      <p
        role="alert"
        class="text-destructive pointer-events-auto absolute top-16 right-3 max-w-sm rounded border bg-white p-2 text-sm"
      >
        {saveError}
      </p>
    {/if}
  {/if}
</section>
