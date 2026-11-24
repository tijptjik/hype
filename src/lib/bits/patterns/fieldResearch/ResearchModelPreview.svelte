<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// COMPONENTS
import type StationScene from '#lib/bits/patterns/station/StationScene.svelte'
// TYPES
import type { ModelViewerElement } from '@google/model-viewer'
import type { StationState } from '#lib/indoor/station.svelte.js'
import type { MapBundle } from '#lib/indoor/releases.js'

let {
  url,
  title,
  interior,
  frontViewId,
}: {
  url: string
  title: string
  interior: boolean
  frontViewId: string | null
} = $props()
let host: HTMLDivElement
let ready = $state(false)
let failed = $state(false)
let scene = $state.raw<StationState>()
let IndoorScene = $state.raw<typeof StationScene>()

// Instantiate previews as their cards approach the viewport. Each keyed card owns its requests.
onMount(() => {
  const controller = new AbortController()
  const { signal } = controller
  let worker: Worker | undefined
  async function showExterior(viewer: ModelViewerElement): Promise<void> {
    // Use the same geometry and view IDs as the façade editor before revealing the model.
    try {
      const blob = await viewer.exportScene({
        binary: true,
        onlyVisible: true,
        maxTextureSize: 1,
      })
      if (signal.aborted) return
      if (blob.size > 256 * 1024 * 1024) {
        ready = true
        return
      }
      const buffer = await blob.arrayBuffer()
      if (signal.aborted) return
      worker = new Worker(
        new URL('../../../locations/exterior/facades.worker.ts', import.meta.url),
        { type: 'module' },
      )
      const finish = () => {
        worker?.terminate()
        ready = true
      }
      worker.onmessage = async ({ data }) => {
        if (signal.aborted) return
        if (Number.isFinite(data.heading)) {
          viewer.setAttribute('camera-orbit', `${data.heading}deg 90deg auto`)
          await viewer.updateComplete
          if (signal.aborted) return
          viewer.jumpCameraToGoal()
        }
        finish()
      }
      worker.onerror = finish
      worker.postMessage({ buffer, assetId: url, frontViewId }, [buffer])
    } catch {
      worker?.terminate()
      if (!signal.aborted) ready = true
    }
  }
  async function load(): Promise<void> {
    try {
      if (interior) {
        const [response, { StationState }, component] = await Promise.all([
          fetch(url, { signal }),
          import('#lib/indoor/station.svelte.js'),
          import('#lib/bits/patterns/station/StationScene.svelte'),
        ])
        if (!response.ok) throw new Error('Interior unavailable')
        const bundle: MapBundle = await response.json()
        if (signal.aborted) return
        const station = new StationState(() => null, false)
        station.loadDraft(bundle.data)
        station.exploded = true
        scene = station
        IndoorScene = component.default
        ready = true
      } else {
        await import('@google/model-viewer')
        if (signal.aborted) return
        const viewer = document.createElement('model-viewer')
        viewer.setAttribute('alt', title)
        viewer.setAttribute('camera-controls', '')
        viewer.setAttribute('touch-action', 'pan-y')
        viewer.style.cssText = 'width:100%;height:100%'
        viewer.addEventListener('load', () => void showExterior(viewer), {
          once: true,
          signal,
        })
        viewer.addEventListener('error', () => (failed = true), { signal })
        viewer.setAttribute('src', url)
        host.append(viewer)
      }
    } catch {
      if (!signal.aborted) failed = true
    }
  }
  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      void load()
    },
    { rootMargin: '160px' },
  )
  observer.observe(host)
  return () => {
    worker?.terminate()
    controller.abort()
    observer.disconnect()
    scene?.close(false)
  }
})
</script>

<div class="relative h-full w-full">
  <div bind:this={host} class="absolute inset-0"></div>
  {#if failed}
    <p
      role="status"
      class="text-muted-foreground absolute inset-0 grid place-items-center text-sm"
    >
      {interior ? 'Interior' : 'Exterior'} preview unavailable
    </p>
  {:else if !ready}
    <div
      role="status"
      aria-label={'Loading ' + title}
      class="bg-muted absolute inset-0"
    ></div>
  {:else if IndoorScene && scene?.data}
    <IndoorScene
      station={scene}
      data={scene.data}
      allowSelection={false}
      onSelect={() => {}}
    />
  {/if}
</div>
