<!-- biome-ignore-all lint/a11y/noNoninteractiveTabindex: The overflow region must support keyboard scrolling on narrow screens. -->
<script lang="ts">
// ICONS
import MaximizeIcon from 'virtual:icons/lucide/maximize'
import XIcon from 'virtual:icons/lucide/x'
// TYPES
import type { Mounted } from 'pele/core'

let {
  source,
  label,
  naturalSize = false,
}: { source: string; label: string; naturalSize?: boolean } = $props()
let container = $state<HTMLDivElement>()
let lightbox = $state<HTMLDialogElement>()
let fullscreenContainer = $state<HTMLDivElement>()
let fullscreen = $state(false)
let fullscreenError = $state(false)
let error = $state(false)
let loading = $state(true)
let diagramWidth = $state(0)
let dragging = $state(false)
let drag:
  | { pointerId: number; x: number; y: number; left: number; top: number }
  | undefined

/** Capture a primary pointer to pan the diagram without selecting its labels. */
function startPan(event: PointerEvent): void {
  if (event.button !== 0 || !event.isPrimary) return
  const viewport = event.currentTarget as HTMLElement
  drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    left: viewport.scrollLeft,
    top: viewport.scrollTop,
  }
  viewport.setPointerCapture(event.pointerId)
  viewport.focus({ preventScroll: true })
  dragging = true
  event.preventDefault()
}

/** Move the diagram in both axes relative to the captured pointer origin. */
function movePan(event: PointerEvent): void {
  if (!drag || drag.pointerId !== event.pointerId) return
  const viewport = event.currentTarget as HTMLElement
  viewport.scrollLeft = drag.left - (event.clientX - drag.x)
  viewport.scrollTop = drag.top - (event.clientY - drag.y)
}

/** End a pan on release, cancellation or lost pointer capture. */
function endPan(event: PointerEvent): void {
  if (drag?.pointerId !== event.pointerId) return
  drag = undefined
  dragging = false
  const viewport = event.currentTarget as HTMLElement
  if (viewport.hasPointerCapture(event.pointerId))
    viewport.releasePointerCapture(event.pointerId)
}

/** Open the native modal in the top layer and retain native focus restoration.
 * @returns Nothing.
 */
function openFullscreen(): void {
  lightbox?.showModal()
  fullscreen = true
}

$effect(() => {
  const element = fullscreenContainer
  const text = source
  if (!fullscreen || !element) return
  let disposed = false
  let diagram: Mounted | undefined
  fullscreenError = false

  // Render independently so the inline diagram retains its size and pan position.
  void Promise.all([import('pele/core'), import('pele/diagrams/flowchart')])
    .then(([pele, flowchart]) => {
      if (disposed) return
      pele.register(flowchart.default)
      diagram = pele.mount(element, text, {
        zoom: false,
        onRender: result => {
          const svg = element.querySelector('svg')
          if (!svg) return
          // Fit both axes while preserving the complete diagram's aspect ratio.
          svg.setAttribute('viewBox', `0 0 ${result.width} ${result.height}`)
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
          svg.setAttribute('width', '100%')
          svg.setAttribute('height', '100%')
        },
        onError: () => {
          fullscreenError = true
        },
      })
    })
    .catch(() => {
      fullscreenError = true
    })

  return () => {
    disposed = true
    diagram?.destroy()
  }
})

$effect(() => {
  const element = container
  const text = source
  if (!element) return
  let disposed = false
  let diagram: Mounted | undefined
  loading = true
  error = false

  // Load only the flowchart renderer on documentation pages; dispose it on navigation.
  void Promise.all([import('pele/core'), import('pele/diagrams/flowchart')])
    .then(([pele, flowchart]) => {
      if (disposed) return
      pele.register(flowchart.default)
      diagram = pele.mount(element, text, {
        zoom: false,
        onRender: result => {
          diagramWidth = result.width
          loading = false
        },
        onError: () => {
          error = true
          loading = false
        },
      })
    })
    .catch(() => {
      if (disposed) return
      error = true
      loading = false
    })

  return () => {
    disposed = true
    diagram?.destroy()
  }
})
</script>

<figure class="min-w-0">
  <div class="mb-3 flex items-start justify-between gap-3">
    <figcaption class="text-muted-foreground text-sm">{label}</figcaption>
    <button
      type="button"
      class="border-border hover:bg-base-200 focus-visible:outline-primary flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm focus-visible:outline-2 disabled:opacity-50"
      aria-label={`View ${label} full screen`}
      disabled={loading || error}
      onclick={openFullscreen}
    >
      <MaximizeIcon class="size-4" />
      Full screen
    </button>
  </div>
  {#if error}
    <p role="alert">
      The diagram could not be rendered. Its Mermaid source is available below.
    </p>
  {/if}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The overflow region needs keyboard scrolling.) -->
  <section
    class="border-border bg-base-100 focus-visible:outline-primary relative touch-none overflow-hidden rounded-xl border p-4 select-none focus-visible:outline-2"
    class:cursor-grab={!dragging}
    class:cursor-grabbing={dragging}
    onpointerdown={startPan}
    onpointermove={movePan}
    onpointerup={endPan}
    onpointercancel={endPan}
    onlostpointercapture={endPan}
    onkeydown={event => {
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-80, 0],
        ArrowRight: [80, 0],
        ArrowUp: [0, -80],
        ArrowDown: [0, 80],
      }
      const delta = directions[event.key]
      if (!delta) return
      event.preventDefault()
      event.currentTarget.scrollBy(delta[0], delta[1])
    }}
    style:max-height="min(100dvh, var(--docs-viewport-height, 100dvh))"
    aria-label={label}
    tabindex="0"
    style="--pele-bg:var(--color-base-100);--pele-fg:var(--color-base-content);--pele-muted:var(--color-base-content);--pele-line:var(--color-base-content);--pele-surface:var(--color-base-200);--pele-surface-alt:var(--color-base-300);--pele-border:var(--color-base-content);--pele-accent:var(--color-primary);--pele-error:var(--color-error);--pele-font:var(--font-sans);"
  >
    {#if loading}
      <div
        class="bg-foreground/10 absolute inset-4 rounded-xl motion-safe:animate-pulse"
        role="status"
        aria-label="Loading diagram"
        aria-busy="true"
      ></div>
    {/if}
    <!-- Sources are repository-authored constants, never user-provided markup. -->
    <div
      bind:this={container}
      class="mx-auto [&_svg]:h-auto [&_svg]:w-full"
      class:min-h-48={loading && !diagramWidth}
      style:width={naturalSize ? `${diagramWidth}px` : undefined}
      style:min-width={`${diagramWidth}px`}
      aria-hidden="true"
    ></div>
  </section>
  <p class="text-muted-foreground mt-2 text-xs">
    Drag to explore the diagram. With the diagram focused, use the arrow keys to pan.
  </p>
  <details class="mt-3">
    <summary class="text-muted-foreground cursor-pointer text-sm">
      Mermaid source
    </summary>
    <pre
      class="bg-base-200 mt-3 overflow-x-auto rounded-lg p-4 text-xs"
    ><code>{source}</code></pre>
  </details>
</figure>

<dialog
  bind:this={lightbox}
  aria-label={`${label} — full screen`}
  class="bg-base-100 text-base-content fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden p-0 backdrop:bg-black/80"
  onclose={() => {
    fullscreen = false
  }}
>
  <div class="flex h-full min-h-0 flex-col p-4 sm:p-6">
    <div class="mb-4 flex shrink-0 items-start justify-between gap-4">
      <h2 class="text-lg font-semibold">{label}</h2>
      <button
        type="button"
        class="border-border hover:bg-base-200 focus-visible:outline-primary flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 focus-visible:outline-2"
        aria-label="Close full-screen diagram"
        onclick={() => lightbox?.close()}
      >
        <XIcon class="size-4" />
        Close
      </button>
    </div>
    {#if fullscreenError}
      <p role="alert">
        The diagram could not be rendered. Close this view to read its Mermaid source.
      </p>
    {/if}
    <div
      bind:this={fullscreenContainer}
      class="min-h-0 min-w-0 flex-1 overflow-hidden [&_svg]:block [&_svg]:h-full! [&_svg]:max-h-full [&_svg]:w-full! [&_svg]:max-w-full"
      role="img"
      aria-label={label}
      style="--pele-bg:var(--color-base-100);--pele-fg:var(--color-base-content);--pele-muted:var(--color-base-content);--pele-line:var(--color-base-content);--pele-surface:var(--color-base-200);--pele-surface-alt:var(--color-base-300);--pele-border:var(--color-base-content);--pele-accent:var(--color-primary);--pele-error:var(--color-error);--pele-font:var(--font-sans);"
    ></div>
  </div>
</dialog>
