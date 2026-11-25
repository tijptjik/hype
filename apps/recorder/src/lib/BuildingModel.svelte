<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { t } from './i18n'
// COMPONENTS
import BuildingModelSkeleton from './BuildingModelSkeleton.svelte'
import Selector from './Selector.svelte'
// API
import { readRecorderAsset } from './assetCache'
// DOMAIN
import {
  facadeViews,
  resolveFloorLines,
  type FloorLine,
  type FacadeView,
} from '../../../../src/lib/locations/exterior/floorAlignment'
import {
  floorTextureAnchors,
  textureHeight,
} from '../../../../src/lib/locations/exterior/floorTexture'
import type { FacadePin } from '../../../../src/lib/fieldResearch/recorder'
import type { FacadeAnalysis } from '../../../../src/lib/locations/exterior/facades'
import type { ModelViewerElement } from '@google/model-viewer'

let {
  url,
  pin,
  readonly = false,
  onpick,
}: {
  url: string
  pin: FacadePin | null
  readonly?: boolean
  onpick: (pin: FacadePin | null) => void
} = $props()
let host: HTMLDivElement
let viewer = $state.raw<ModelViewerElement>()
let views = $state.raw<FacadeView[]>([])
let lines = $state.raw<FloorLine[]>([])
let revision = 0
let assetId = $derived(url.split('/').at(-2)!)
let geometryId = $state('')
let side = $state('')
let flat = $state(false)
let face = $derived(views.find(view => view.id === side))
let blend = $state(0)
let mixer = $state.raw<{ set: (n: number) => void; dispose: () => void }>()
let imageryIssue = $state(false)
let loading = $state(true)
let problem = $state('')
let attempt = $state(0)
let linePixels = $state<number[]>([])
let markPixel = $state<{ x: number; y: number } | null>(null)
let anchors = $derived(floorTextureAnchors(viewer?.originalGltfJson, side))
let designations = $derived(resolveFloorLines(lines))
let floorContext = $derived(
  pin?.floorLabel && pin.facadeId === side ? pin.floorLabel : '',
)
let readyToPick = $state(false)
const directions = [
  'North',
  'Northeast',
  'East',
  'Southeast',
  'South',
  'Southwest',
  'West',
  'Northwest',
]
function direction(face: FacadeView): string {
  return directions[
    (Math.round((Math.atan2(face.normal[0], -face.normal[2]) * 4) / Math.PI) + 8) % 8
  ]
}
function selectFace(id: string): void {
  const wall = views.find(v => v.id === id)
  if (!readonly && wall && pin?.facadeId !== id)
    onpick({
      realm: 'exterior',
      surface: 'facade',
      assetId,
      geometryId,
      facadeId: id,
      direction: direction(wall),
      percent: null,
      blend,
      alignmentRevision: revision,
    })
  side = id
  flat = true
}
// Follow the actual rendered surface under the pointer, excluding roofs and empty background.
function tap(ev: MouseEvent): void {
  if (!viewer || !readyToPick) return
  const hit = viewer.positionAndNormalFromPoint(ev.clientX, ev.clientY)
  if (!hit || Math.abs(hit.normal.y) > 0.3) return
  const score = (v: FacadeView) =>
    v.normal[0] * hit.normal.x + v.normal[2] * hit.normal.z
  const wall = views.reduce<FacadeView | undefined>(
    (best, v) => (!best || score(v) > score(best) ? v : best),
    undefined,
  )
  if (!wall || score(wall) < 0.9) return
  if (!flat) {
    selectFace(wall.id)
    return
  }
  if (readonly || !face || face.id !== wall.id) return
  const { x, y, z } = hit.position
  const elevation = textureHeight(y, anchors, blend, true)
  const u =
    0.5 +
    ((x - face.centre[0]) * face.right[0] + (z - face.centre[2]) * face.right[2]) /
      face.width
  const v = (elevation - face.bottom) / (face.top - face.bottom)
  if (u < 0 || u > 1 || v < 0 || v > 1) return
  const floor = lines.findIndex(
    (line, i) =>
      i < lines.length - 1 &&
      elevation >= line.elevation &&
      elevation < lines[i + 1].elevation,
  )
  onpick({
    realm: 'exterior',
    surface: 'facade',
    assetId,
    geometryId,
    facadeId: face.id,
    direction: direction(face),
    percent: [100 * u, 100 * v],
    blend,
    alignmentRevision: revision,
    ...(floor < 0
      ? {}
      : { floorId: lines[floor].id, floorLabel: designations[floor].label }),
  })
}
$effect(() => {
  const source = url,
    originalId = assetId,
    saved = untrack(() => pin)
  const reload = attempt > 0
  const controller = new AbortController(),
    { signal } = controller
  const objects: string[] = []
  let worker: Worker | undefined
  let binding: typeof mixer
  loading = true
  imageryIssue = false
  problem = ''
  viewer = undefined
  views = []
  lines = []
  mixer = undefined
  flat = false
  readyToPick = false
  function local(blob: Blob): string {
    signal.throwIfAborted()
    const uri = URL.createObjectURL(blob)
    objects.push(uri)
    return uri
  }
  async function load() {
    await import('@google/model-viewer')
    const base = new URL(source, location.href)
    const metadataUrl = new URL('placement.json', base)
    if (saved) {
      metadataUrl.searchParams.set('geometry', saved.geometryId)
      metadataUrl.searchParams.set('revision', String(saved.alignmentRevision))
    }
    const metadataResponse = await fetch(metadataUrl, { signal })
    if (!metadataResponse.ok) throw Error(t('facade_information_failed'))
    type Alignment = { revision: number; lines: FloorLine[] }
    const metadata = (await metadataResponse.json()) as {
      comparisonFile: string | null
      alignments: Record<string, Alignment>
    }
    if (saved && saved.assetId !== originalId) throw Error(t('earlier_exterior_model'))
    let comparison = saved
      ? saved.geometryId === originalId
        ? null
        : saved.geometryId
      : metadata.comparisonFile
    let blob: Blob | null = null
    if (comparison && /^comparison-[a-f0-9]{64}\.glb$/.test(comparison)) {
      blob = await readRecorderAsset(
        new URL(comparison, base),
        signal,
        file => file,
        reload,
      )
      if (!blob && saved) throw Error(t('saved_imagery_unavailable'))
      if (!blob) comparison = null
    }
    let src: string
    if (blob) src = local(blob)
    else {
      const model = await readRecorderAsset(
        source,
        signal,
        async file => JSON.parse(await file.text()),
        reload,
      )
      if (!model) throw Error(t('building_model_failed'))
      const siblings = new Map<string, string>()
      for (const item of [...(model.buffers ?? []), ...(model.images ?? [])]) {
        const file = item.uri
        if (!file || file.startsWith('data:')) continue
        if (!/^[a-zA-Z0-9_.-]+\.(bin|jpe?g|png)$/i.test(file))
          throw Error('Invalid model resource.')
        if (!siblings.has(file)) {
          const resource = await readRecorderAsset(
            new URL(file, base),
            signal,
            blob => blob,
            reload,
          )
          if (!resource) throw Error(t('building_model_failed'))
          siblings.set(file, local(resource))
        }
        item.uri = siblings.get(file)
      }
      src = local(new Blob([JSON.stringify(model)], { type: 'model/gltf+json' }))
    }
    signal.throwIfAborted()
    geometryId = comparison || originalId
    const el = document.createElement('model-viewer') as ModelViewerElement
    el.alt = t('building_model')
    el.cameraControls = true
    el.disableTap = true
    el.loading = 'eager'
    el.className = 'absolute inset-0 h-full w-full'
    el.setAttribute('touch-action', 'none')
    const loaded = new Promise<void>((ok, no) => {
      el.addEventListener('load', () => ok(), { once: true, signal })
      el.addEventListener('error', () => no(Error(t('building_model_failed'))), {
        once: true,
        signal,
      })
      signal.addEventListener('abort', () => no(signal.reason), { once: true })
    })
    el.src = src
    host.replaceChildren(el)
    await loaded
    signal.throwIfAborted()
    viewer = el
    loading = false
    if (blob) {
      const { bindTextureBlend } = await import(
        '../../../../src/lib/locations/exterior/textureBlend'
      )
      try {
        binding = await bindTextureBlend(el, signal)
        mixer = binding
      } catch {
        signal.throwIfAborted()
        imageryIssue = true
      }
    }
    const geometry =
      blob ??
      (await el.exportScene({ binary: true, onlyVisible: true, maxTextureSize: 1 }))
    if (geometry.size > 256 * 1024 * 1024) throw Error(t('facade_model_too_large'))
    const buffer = await geometry.arrayBuffer()
    signal.throwIfAborted()
    worker = new Worker(
      new URL(
        '../../../../src/lib/locations/exterior/facades.worker.ts',
        import.meta.url,
      ),
      { type: 'module' },
    )
    const result = await new Promise<FacadeAnalysis>((ok, no) => {
      worker!.onmessage = e =>
        e.data.error ? no(Error(e.data.error)) : ok(e.data.result)
      worker!.onerror = () => no(Error(t('facade_geometry_failed')))
      signal.addEventListener('abort', () => no(signal.reason), { once: true })
      worker!.postMessage({ buffer, assetId: geometryId }, [buffer])
    })
    worker.terminate()
    signal.throwIfAborted()
    views = facadeViews(result.facades)
    if (!views.length) throw Error(t('no_vertical_facades'))
    const alignment = metadata.alignments[geometryId]
    lines = alignment?.lines ?? []
    revision = alignment?.revision ?? 0
    side = saved?.facadeId ?? views[0].id
    blend = binding ? (saved?.blend ?? 0) : 0
    flat = !!saved
    if (saved && !views.some(v => v.id === side))
      throw Error(t('saved_facade_unavailable'))
    readyToPick = true
  }
  void load().catch(e => {
    if (!signal.aborted) {
      problem = e instanceof Error ? e.message : t('building_model_failed')
      loading = false
    }
  })
  return () => {
    controller.abort()
    worker?.terminate()
    binding?.dispose()
    host.replaceChildren()
    for (const uri of objects) URL.revokeObjectURL(uri)
  }
})
$effect(() => {
  mixer?.set(blend)
})
$effect(() => {
  const el = viewer,
    f = face
  if (!el) return
  el.zoomSensitivity = flat ? 0.65 : 1
  if (!flat || !f) {
    el.minCameraOrbit = 'auto auto auto'
    el.maxCameraOrbit = 'auto auto auto'
    el.cameraOrbit = 'auto auto auto'
    el.cameraTarget = 'auto auto auto'
    return
  }
  const theta = (Math.atan2(f.normal[0], f.normal[2]) * 180) / Math.PI
  const aspect = el.clientWidth / Math.max(1, el.clientHeight)
  const distance = Math.max(f.width / aspect, f.top - f.bottom) * 2.2
  el.minCameraOrbit = theta + 'deg 90deg 0.05m'
  el.maxCameraOrbit = theta + 'deg 90deg ' + distance * 3 + 'm'
  el.cameraTarget = f.centre.map(v => v + 'm').join(' ')
  el.cameraOrbit = theta + 'deg 90deg ' + distance + 'm'
  void el.updateComplete.then(() => el.jumpCameraToGoal())
})
// Hotspots project the registered elevations and the saved cross through the same camera as the model.
$effect(() => {
  const el = viewer,
    f = face,
    saved = pin
  if (!el || !flat || !f) {
    linePixels = []
    markPixel = null
    return
  }
  const spots: HTMLElement[] = []
  function anchor(name: string, u: number, elevation: number) {
    const node = document.createElement('span')
    node.slot = 'hotspot-' + name
    const dx = (u - 0.5) * f!.width
    node.dataset.position = [
      f!.centre[0] + f!.right[0] * dx,
      textureHeight(elevation, anchors, blend),
      f!.centre[2] + f!.right[2] * dx,
    ].join(' ')
    node.dataset.normal = f!.normal.join(' ')
    el!.append(node)
    spots.push(node)
  }
  for (const [i, line] of lines.entries()) anchor('floor-' + i, 0.5, line.elevation)
  const marked =
    saved?.facadeId === f.id && saved.geometryId === geometryId && saved.percent
  if (marked)
    anchor('cross', marked[0] / 100, f.bottom + (marked[1] * (f.top - f.bottom)) / 100)
  let frame = 0
  function project() {
    linePixels = lines.map(
      (_, i) => el!.queryHotspot('hotspot-floor-' + i)?.canvasPosition.y ?? -1000,
    )
    markPixel = marked
      ? (el!.queryHotspot('hotspot-cross')?.canvasPosition ?? null)
      : null
  }
  function schedule() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(project)
  }
  const resize = new ResizeObserver(schedule)
  resize.observe(el)
  el.addEventListener('camera-change', schedule)
  schedule()
  return () => {
    el.removeEventListener('camera-change', schedule)
    resize.disconnect()
    cancelAnimationFrame(frame)
    for (const spot of spots) spot.remove()
  }
})
let taps = new Set<number>(),
  moved = false,
  start = [0, 0]
</script>
<fieldset
  class="bg-surface relative min-h-56 min-w-0 flex-1 overflow-hidden rounded-xl"
  aria-label={t('building_model')}
  onpointerdowncapture={e => {
    if (!(e.target instanceof Node) || !host.contains(e.target)) return
    if (!taps.size) {
      start = [e.clientX, e.clientY]
      moved = false
    } else moved = true
    taps.add(e.pointerId)
  }}
  onpointermovecapture={e => {
    if (
      taps.has(e.pointerId) &&
      Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5
    )
      moved = true
  }}
  onpointercancelcapture={e => {
    taps.delete(e.pointerId)
    moved = true
  }}
  onpointerupcapture={e => {
    if (taps.delete(e.pointerId) && !moved) tap(e)
  }}
>
  <div bind:this={host} class="absolute inset-0"></div>
  {#if loading}
    <BuildingModelSkeleton />
  {/if}
  {#if flat}
    {#each linePixels as y, i}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/80"
        style:top={y + 'px'}
      >
        <small class="bg-black/70 px-1 text-white">{designations[i]?.label}</small>
      </div>
    {/each}
    {#if markPixel}
      <span
        role="img"
        aria-label={t('marker')}
        class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-3xl font-bold text-red-600 [text-shadow:0_0_2px_white]"
        style:left={markPixel.x + 'px'}
        style:top={markPixel.y + 'px'}
        >×</span
      >
    {/if}
    <button
      type="button"
      aria-label={t('return_to_model')}
      title={t('return_to_model')}
      class="bg-panel text-ink border-line absolute right-2 bottom-2 grid size-11 place-items-center rounded-full border shadow-md"
      onclick={() => (flat = false)}
    >
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m9 5-6 6 6 6m-6-6h11a6 6 0 0 1 6 6v2" />
      </svg>
    </button>
  {/if}
</fieldset>
{#if problem}
  <p role="alert">{problem}</p>
  <button type="button" class="min-h-11" onclick={() => attempt++}>{t('retry')}</button>
{/if}
{#if flat && face}
  {#if floorContext}
    <p class="font-semibold">{floorContext} · {direction(face)} facade</p>
  {/if}
  {#if mixer}
    <label class="grid gap-1"
      ><span class="flex justify-between text-xs"
        ><span>{t('original_imagery')}</span><span>{t('custom_imagery')}</span
        ><span>{t('ai_imagery')}</span></span
      >
      <input
        aria-label={t('facade_imagery')}
        type="range"
        min="0"
        max="2"
        step="0.01"
        bind:value={blend}
      >
    </label>
  {/if}
{/if}
{#if views.length}
  {#if imageryIssue}
    <small>{t('only_original')}</small>
  {/if}
  <Selector
    label={t('facade')}
    icon="building"
    value={side}
    wheel
    disabled={readonly}
    options={views.map((v, i) => ({
      id: v.id,
      name: direction(v) + ' · ' + (i + 1) + ' of ' + views.length,
      address: t('model_compass'),
    }))}
    onchange={selectFace}
  />
{/if}
