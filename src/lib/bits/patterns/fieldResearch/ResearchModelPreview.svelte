<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// COMPONENTS
import type StationScene from '#lib/bits/patterns/station/StationScene.svelte'
// TYPES
import type { StationState } from '#lib/indoor/station.svelte.js'
import type { MapBundle } from '#lib/indoor/releases.js'

let { url, title, interior }: { url: string; title: string; interior: boolean } =
  $props()
let host: HTMLDivElement
let ready = $state(false)
let failed = $state(false)
let scene = $state.raw<StationState>()
let IndoorScene = $state.raw<typeof StationScene>()

// Instantiate previews as their cards approach the viewport. Each keyed card owns its requests.
onMount(() => {
  const controller = new AbortController()
  const { signal } = controller
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
        viewer.addEventListener('load', () => (ready = true), { signal })
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
      class="bg-muted pointer-events-none absolute inset-0 motion-safe:animate-pulse"
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
