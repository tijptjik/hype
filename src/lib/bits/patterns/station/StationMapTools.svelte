<script lang="ts">
// SVELTE
import { fly } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// BITS
import { Dialog } from 'bits-ui'
// ICONS
import KeyboardIcon from 'virtual:icons/proicons/keyboard'
import CloseIcon from 'virtual:icons/proicons/cancel-circle'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
// COMPONENTS
import StationCameraControls from './StationCameraControls.svelte'
import StationRouteControls from './StationRouteControls.svelte'
const station = getAppCtx().station
let panel = $state<'settings' | 'route' | null>(null)
let shortcuts = $state(false)
let root: HTMLDivElement
/** Open keyboard help only outside editable fields. @param event Keyboard event. @returns Nothing. */
function keydown(event: KeyboardEvent): void {
  const target = event.target
  if (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    )
  )
    return
  if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    panel = null
    shortcuts = true
  }
  if (event.key === 'Escape') panel = null
}
</script>
<svelte:window
  onkeydown={keydown}
  onpointerdown={event => {
    if (event.target instanceof Node && !root?.contains(event.target)) panel = null
  }}
/>
<div bind:this={root} class="relative flex items-center gap-2">
  {#if panel}
    <section
      id="station-map-tools-panel"
      aria-label={panel === 'settings' ? 'Map settings' : 'Route preview'}
      class="text-base-content absolute right-0 bottom-full mb-3 max-h-[65vh] w-max max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl bg-[var(--station-canvas)] p-4 shadow-sm"
      transition:fly={{ y: 12, duration: prefersReducedMotion.current ? 0 : 160 }}
    >
      <div class="mb-3 flex items-center justify-between gap-4">
        <h2 class="text-primary text-sm font-medium">
          {panel === 'settings' ? 'Map settings' : 'Route preview'}
        </h2>
        <button
          type="button"
          aria-label="Close map controls"
          class="rounded p-1"
          onclick={() => (panel = null)}
        >
          <CloseIcon class="size-5" />
        </button>
      </div>
      {#if panel === 'settings'}
        <StationCameraControls />
      {:else}
        <StationRouteControls />
      {/if}
    </section>
  {/if}
  {#if station.data?.coordinateSpace !== 'image-pixels'}
    <button
      type="button"
      aria-label="Route preview"
      title="Route preview"
      aria-expanded={panel === 'route'}
      aria-controls="station-map-tools-panel"
      class="text-primary hover:bg-surface focus-visible:outline-focus flex size-11 items-center justify-center rounded-full bg-[var(--station-canvas)] shadow-sm"
      onclick={() => (panel = panel === 'route' ? null : 'route')}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="5" cy="18" r="2" />
        <path d="M5 16V9a3 3 0 0 1 3-3h11m-4-4 4 4-4 4" />
      </svg>
    </button>
  {/if}
  <button
    type="button"
    aria-label="Map settings"
    title="Map settings"
    aria-expanded={panel === 'settings'}
    aria-controls="station-map-tools-panel"
    class="text-primary hover:bg-surface focus-visible:outline-focus flex size-11 items-center justify-center rounded-full bg-[var(--station-canvas)] shadow-sm"
    onclick={() => (panel = panel === 'settings' ? null : 'settings')}
  >
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path
        d="M5 3v5m0 4v9M12 3v10m0 4v4M19 3v3m0 4v11M2 8h6v4H2zM9 13h6v4H9zM16 6h6v4h-6z"
      />
    </svg>
  </button>
  <Dialog.Root bind:open={shortcuts}>
    <Dialog.Trigger
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts"
      class="text-primary hover:bg-surface focus-visible:outline-focus flex size-11 items-center justify-center rounded-full bg-[var(--station-canvas)] shadow-sm"
      onclick={() => (panel = null)}
      ><KeyboardIcon class="size-6" /></Dialog.Trigger
    >
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm" />
      <Dialog.Content
        class="bits-theme border-border bg-panel text-foreground fixed top-1/2 left-1/2 z-[1001] max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-2xl"
      >
        <div class="flex items-center justify-between gap-4">
          <Dialog.Title class="text-foreground text-xl font-semibold tracking-tight"
            >Map shortcuts</Dialog.Title
          ><Dialog.Close aria-label="Close keyboard shortcuts" class="rounded-full p-2"
            ><CloseIcon class="size-6" /></Dialog.Close
          >
        </div>
        <Dialog.Description class="text-muted-foreground mt-2 mb-5 text-sm"
          >Focus the map to use its keyboard controls.</Dialog.Description
        >
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt><kbd>?</kbd></dt>
          <dd>Show this help</dd>
          <dt><kbd>+</kbd> / <kbd>−</kbd></dt>
          <dd>Zoom in / out</dd>
          <dt><kbd>←</kbd> / <kbd>→</kbd></dt>
          <dd>Rotate the map</dd>
          <dt><kbd>↑</kbd> / <kbd>↓</kbd></dt>
          <dd>Adjust tilt</dd>
          <dt><kbd>0</kbd></dt>
          <dd>Reset zoom and pan</dd>
          <dt>Drag</dt>
          <dd>Pan</dd>
          <dt>Ctrl-drag</dt>
          <dd>Rotate and tilt</dd>
          <dt>Alt-drag</dt>
          <dd>Tilt</dd>
          <dt>Scroll</dt>
          <dd>Zoom</dd>
          <dt>Alt-scroll</dt>
          <dd>Rotate</dd>
          <dt>Ctrl+Alt-scroll</dt>
          <dd>Tilt</dd>
          <dt>Two fingers</dt>
          <dd>Pan, pinch to zoom, and rotate</dd>
        </dl>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
</div>
