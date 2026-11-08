<script lang="ts">
import { tick } from 'svelte'
import { cx } from '#lib/bits/utils.js'
import Maplet from '#lib/bits/patterns/maps/LazyMaplet.svelte'
import MapLoading from '#lib/bits/patterns/maps/MapLoading.svelte'
import { m } from '#lib/i18n.js'
import type { TaskMapProps } from '../task.types'
import type { MapController } from '#lib/map/controller.js'
import ExpandIcon from 'virtual:icons/proicons/full-screen-maximize'
import ShrinkIcon from 'virtual:icons/proicons/full-screen-minimize'

type StartViewTransitionCapableDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>
  }
}

let {
  coordinates,
  loading = false,
  comparison = null,
  initialZoom = 19,
  showFullscreen = true,
  expandOnClick = false,
  label = 'Detailed location map',
  addressMeta,
  mapStyleCode = null,
  class: className = '',
}: TaskMapProps = $props()

let isFullscreen = $state(false)
let taskMapController = $state<MapController | null>(null)
const handleTaskMapReady = (controller: MapController | null): void => {
  taskMapController = controller
}

async function runViewTransition(update: () => void | Promise<void>): Promise<void> {
  if (typeof document === 'undefined') {
    await update()
    return
  }

  const transitionDocument = document as StartViewTransitionCapableDocument
  if (typeof transitionDocument.startViewTransition !== 'function') {
    await update()
    await tick()
    return
  }

  const transition = transitionDocument.startViewTransition(async () => {
    await update()
    await tick()
  })

  try {
    await transition.finished
  } catch {
    // Ignore aborted transitions and preserve the latest map state.
  }
}

async function toggleFullscreen(): Promise<void> {
  await runViewTransition(async () => {
    isFullscreen = !isFullscreen
  })
  await tick()
  taskMapController?.resize()
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (!isFullscreen || event.key !== 'Escape') return

  event.preventDefault()
  void toggleFullscreen()
}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section
  aria-label={label}
  class={cx(
    'relative min-h-[18rem] flex-1 overflow-hidden bg-surface',
    isFullscreen && 'fixed inset-0 z-[999] h-auto! rounded-none border-0',
    className,
  )}
  style={isFullscreen ? 'view-transition-name: task-map-stage;' : undefined}
>
  {#if coordinates}
    <Maplet
      {comparison}
      showMarker={!comparison}
      {coordinates}
      {initialZoom}
      draggable={false}
      {addressMeta}
      {mapStyleCode}
      onMapReady={handleTaskMapReady}
    />
  {:else if loading}
    <MapLoading />
  {:else}
    <p
      class="text-muted-foreground flex h-full items-center justify-center p-4 text-sm"
    >
      {m.location_map_unavailable()}
    </p>
  {/if}

  {#if coordinates && expandOnClick && !isFullscreen}
    <button
      type="button"
      class="focus-visible:outline-accent absolute inset-0 z-20 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2"
      aria-label="Open fullscreen map"
      onclick={() => {
        void toggleFullscreen()
      }}
    ></button>
  {/if}

  {#if coordinates && ((showFullscreen && !expandOnClick) || isFullscreen)}
    <button
      type="button"
      class="border-border bg-panel/95 text-foreground hover:bg-panel/90 absolute bottom-4 left-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-lg border transition"
      onclick={() => {
        void toggleFullscreen()
      }}
      aria-label={isFullscreen ? 'Exit fullscreen map' : 'Open fullscreen map'}
    >
      {#if isFullscreen}
        <ShrinkIcon class="h-5 w-5" />
      {:else}
        <ExpandIcon class="h-5 w-5" />
      {/if}
    </button>
  {/if}
</section>
