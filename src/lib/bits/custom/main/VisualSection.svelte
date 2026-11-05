<script lang="ts">
import { setContext, onDestroy } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
import { VISUAL_RESIZE_CONTEXT } from './visualResize.js'
import { VISUAL_TRANSITION_MS } from './visualTransition.js'
import type { MainVisualSectionProps } from './main.types'

let {
  class: className = '',
  resizeLabel,
  onHeightChange,
  isCollapsed = false,
  expandedHeight = 520,
  minimumHeight = 200,
  collapsedHeight = 64,
  imageAspectRatio = null,
  showImage = true,
  showControls = true,
  leftControls,
  centerControls,
  rightControls,
  map,
  image,
}: MainVisualSectionProps = $props()

let measuredHeight = $state(0)
$effect(() => {
  if (measuredHeight > 0) onHeightChange?.(measuredHeight)
})

let resizing = $state(false)
let settleTimer: ReturnType<typeof setTimeout> | undefined
setContext(VISUAL_RESIZE_CONTEXT, {
  get active() {
    return resizing
  },
})
function markResizeActivity(): void {
  resizing = true
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    resizing = false
  }, 300)
}
onDestroy(() => clearTimeout(settleTimer))

const visualId = $props.id()
const maximumHeight = 1200
let customHeight = $state<number | null>(null)
let drag = $state<{ pointerId: number; startY: number; startHeight: number } | null>(
  null,
)
const height = $derived(Math.max(minimumHeight, customHeight ?? expandedHeight))

/** Sets the expanded height within the same bounds as the address map.
 * @param value Requested height in CSS pixels.
 * @returns Nothing.
 */
function resize(value: number): void {
  markResizeActivity()
  customHeight = Math.max(minimumHeight, Math.min(maximumHeight, value))
}

/** Captures the pointer so the separator can be dragged outside its hit area.
 * @param event Pointer start event.
 * @returns Nothing.
 */
function startResize(event: PointerEvent & { currentTarget: HTMLDivElement }): void {
  if (event.button !== 0) return
  event.preventDefault()
  markResizeActivity()
  event.currentTarget.setPointerCapture(event.pointerId)
  drag = { pointerId: event.pointerId, startY: event.clientY, startHeight: height }
}

/** Provides keyboard alternatives to dragging the separator.
 * @param event Separator key event.
 * @returns Nothing.
 */
function resizeWithKeyboard(event: KeyboardEvent): void {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  resize(
    event.key === 'Home'
      ? minimumHeight
      : event.key === 'End'
        ? maximumHeight
        : height + (event.key === 'ArrowDown' ? 40 : -40),
  )
}

const rootClass = $derived(
  [
    'bits-theme bits-feature-visual',
    isCollapsed ? 'bits-feature-visual--collapsed' : '',
    resizeLabel ? 'transition-none!' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
const rootStyle = $derived(
  `--bits-feature-visual-expanded-height:${height}px; --bits-feature-visual-collapsed-height:${collapsedHeight}px; --bits-feature-visual-image-ratio:${imageAspectRatio ?? 1}; --bits-feature-visual-transition-duration:${prefersReducedMotion.current ? 0 : VISUAL_TRANSITION_MS}ms;`,
)
</script>

<section
  bind:offsetHeight={measuredHeight}
  id={visualId}
  class={rootClass}
  style={rootStyle}
>
  {#if leftControls}
    <div
      class="bits-feature-visual__controls bits-feature-visual__controls--left transition-opacity duration-200 motion-reduce:transition-none {showControls
        ? 'opacity-100'
        : 'opacity-0 pointer-events-none'}"
      inert={!showControls}
      aria-hidden={!showControls}
    >
      {@render leftControls()}
    </div>
  {/if}

  {#if centerControls}
    <div
      class="bits-feature-visual__controls bits-feature-visual__controls--center transition-opacity duration-200 motion-reduce:transition-none {showControls
        ? 'opacity-100'
        : 'opacity-0 pointer-events-none'}"
      inert={!showControls}
      aria-hidden={!showControls}
    >
      {@render centerControls()}
    </div>
  {/if}

  {#if rightControls}
    <div
      class="bits-feature-visual__controls bits-feature-visual__controls--right transition-opacity duration-200 motion-reduce:transition-none {showControls
        ? 'opacity-100'
        : 'opacity-0 pointer-events-none'}"
      inert={!showControls}
      aria-hidden={!showControls}
    >
      {@render rightControls()}
    </div>
  {/if}

  <div class="bits-feature-visual__body">
    <div class="bits-feature-visual__map {showImage ? '' : 'p-0!'}">
      {@render map?.()}
    </div>

    {#if showImage}
      <div class="bits-feature-visual__image">{@render image?.()}</div>
    {/if}
  </div>
  {#if resizeLabel && !isCollapsed}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
    <!-- biome-ignore lint/a11y/useSemanticElements: This focusable splitter supports keyboard and pointer resizing. -->
    <div
      role="separator"
      tabindex="0"
      aria-label={resizeLabel}
      aria-orientation="horizontal"
      aria-controls={visualId}
      aria-valuemin={minimumHeight}
      aria-valuemax={maximumHeight}
      aria-valuenow={height}
      class="hover:bg-primary/15 focus-visible:bg-primary/20 absolute inset-x-0 bottom-[-6px] z-10 flex h-3 cursor-ns-resize touch-none items-center justify-end pr-32 outline-none"
      onpointerdown={startResize}
      onpointermove={event => {
        if (drag?.pointerId === event.pointerId)
          resize(drag.startHeight + event.clientY - drag.startY)
      }}
      onpointerup={event => {
        if (drag?.pointerId === event.pointerId) {
          event.currentTarget.releasePointerCapture(event.pointerId)
          drag = null
        }
      }}
      onpointercancel={() => (drag = null)}
      onlostpointercapture={() => (drag = null)}
      onkeydown={resizeWithKeyboard}
      ondblclick={() => (customHeight = null)}
    >
      <span aria-hidden="true" class="bg-foreground/35 h-1 w-10 rounded-full"></span>
    </div>
  {/if}
</section>
