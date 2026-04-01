<script lang="ts">
import { tick } from 'svelte'
import { cx } from '$lib/bits/utils'
import Maplet from '$lib/bits/patterns/maps/Maplet.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
import type { TaskMapProps } from '../task.types'
import ExpandIcon from 'virtual:icons/lucide/expand'
import ShrinkIcon from 'virtual:icons/lucide/shrink'

type StartViewTransitionCapableDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>
  }
}

let {
  coordinates,
  addressMeta,
  mapStyleCode = null,
  class: className = '',
}: TaskMapProps = $props()

const appCtx = getAppCtx()
let isFullscreen = $state(false)

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
  appCtx.map?.resize()
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (!isFullscreen || event.key !== 'Escape') return

  event.preventDefault()
  void toggleFullscreen()
}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section
  class={cx(
    'relative min-h-[18rem] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black',
    isFullscreen && 'fixed inset-0 z-[999] rounded-none border-0',
    className,
  )}
  style={isFullscreen ? 'view-transition-name: task-map-stage;' : undefined}
>
  <Maplet {coordinates} draggable={false} {addressMeta} {mapStyleCode} />

  <button
    type="button"
    class="absolute bottom-4 right-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-black/70 text-white transition hover:bg-black/90"
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
</section>
