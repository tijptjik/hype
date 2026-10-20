<script lang="ts">
import type { MainVisualSectionProps } from './main.types'

let {
  class: className = '',
  resizeLabel,
  isCollapsed = false,
  expandedHeight = 520,
  collapsedHeight = 64,
  imageAspectRatio = null,
  leftControls,
  centerControls,
  rightControls,
  map,
  image,
}: MainVisualSectionProps = $props()

const visualId = $props.id()
const minimumHeight = 200
const maximumHeight = 1200
let customHeight = $state<number | null>(null)
let drag = $state<{ pointerId: number; startY: number; startHeight: number } | null>(
  null,
)
const height = $derived(customHeight ?? expandedHeight)

/** Sets the expanded height within the same bounds as the address map.
 * @param value Requested height in CSS pixels.
 * @returns Nothing.
 */
function resize(value: number): void {
  customHeight = Math.max(minimumHeight, Math.min(maximumHeight, value))
}

/** Captures the pointer so the separator can be dragged outside its hit area.
 * @param event Pointer start event.
 * @returns Nothing.
 */
function startResize(event: PointerEvent & { currentTarget: HTMLDivElement }): void {
  if (event.button !== 0) return
  event.preventDefault()
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
  `--bits-feature-visual-expanded-height:${height}px; --bits-feature-visual-collapsed-height:${collapsedHeight}px; --bits-feature-visual-image-ratio:${imageAspectRatio ?? 1};`,
)
</script>

<section id={visualId} class={rootClass} style={rootStyle}>
  {#if leftControls}
    <div class="bits-feature-visual__controls bits-feature-visual__controls--left">
      {@render leftControls()}
    </div>
  {/if}

  {#if centerControls}
    <div class="bits-feature-visual__controls bits-feature-visual__controls--center">
      {@render centerControls()}
    </div>
  {/if}

  {#if rightControls}
    <div class="bits-feature-visual__controls bits-feature-visual__controls--right">
      {@render rightControls()}
    </div>
  {/if}

  <div class="bits-feature-visual__body">
    <div class="bits-feature-visual__map">{@render map?.()}</div>

    <div class="bits-feature-visual__image">{@render image?.()}</div>
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
      class="absolute inset-x-0 bottom-[-6px] z-10 flex h-3 touch-none cursor-ns-resize items-center justify-end pr-32 outline-none hover:bg-primary/15 focus-visible:bg-primary/20"
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
      <span aria-hidden="true" class="h-1 w-10 rounded-full bg-foreground/35"></span>
    </div>
  {/if}
</section>
