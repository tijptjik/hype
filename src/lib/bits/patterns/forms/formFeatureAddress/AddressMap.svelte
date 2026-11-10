<script lang="ts">
// SVELTE
import { onDestroy, onMount, tick, type Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import CheckIcon from 'virtual:icons/proicons/checkmark'

let {
  map,
  toolbarWidth = $bindable(0),
  singleRowToolbar = false,
  coordinatesCompact = $bindable(false),
  measurementCoordinates,
  measurementKey = '',
  locationControl,
  centerLocationControl = false,
  coordinatesInLocationControl = false,
  locationActions,
  toolbarControls,
  toolbarInfo,
  locationMapControls,
  fixedMap = false,
  showMap = true,
  showLookup = true,
  showCoordinates = true,
  coordinatesControl,
  lookupControl,
  onLookup,
  canLookup,
  isEditing,
  isLoading,
  sourceId = null,
}: {
  toolbarWidth?: number
  singleRowToolbar?: boolean
  coordinatesCompact?: boolean
  measurementCoordinates?: Snippet
  measurementKey?: string
  coordinatesInLocationControl?: boolean
  locationControl?: Snippet<[Snippet?]>
  /** Centre the supplied review heading independently of trailing toolbar actions. */
  centerLocationControl?: boolean
  locationActions?: Snippet
  toolbarControls?: Snippet
  toolbarInfo?: Snippet
  locationMapControls?: Snippet
  fixedMap?: boolean
  showMap?: boolean
  showLookup?: boolean
  showCoordinates?: boolean
  coordinatesControl: Snippet
  lookupControl: Snippet
  sourceId?: string | null
  map?: Snippet
  onLookup: () => void
  canLookup: boolean
  isEditing: boolean
  isLoading: boolean
} = $props()

let copiedId = $state<string | null>(null)
let measurementElement: HTMLDivElement | undefined = $state()
let controlsCompact = $state(false)
let toolbarMeasured = $state(false)
let copyFailed = $state(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
onDestroy(() => clearTimeout(copyTimer))

/** Copies only the currently matched source ID and confirms a successful clipboard write.
 * @returns Resolves once clipboard feedback has been updated.
 */
async function copySourceId(): Promise<void> {
  const id = sourceId
  if (isEditing || !id) return
  copyFailed = false
  try {
    await navigator.clipboard.writeText(id)
    if (isEditing || sourceId !== id) return
    copiedId = id
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedId = null
    }, 2000)
  } catch {
    copyFailed = true
  }
}

const mapId = $props.id()
const minimumHeight = 200
const maximumHeight = 1200
let height = $state(320)
// Give the fixed Location map half the viewport on entry, retaining manual resizing.
onMount(() => {
  if (fixedMap) height = Math.min(maximumHeight, window.innerHeight * 0.5)
})
let drag = $state<{ pointerId: number; startY: number; startHeight: number } | null>(
  null,
)

/** Resizes within useful bounds without moving the map's marker or camera.
 * @param value Requested height in CSS pixels. @returns Nothing.
 */
function resize(value: number): void {
  height = Math.max(minimumHeight, Math.min(maximumHeight, value))
}

/** Captures the handle pointer so dragging continues outside its narrow hit area.
 * @param event Pointer start. @returns Nothing.
 */
function startResize(
  event: PointerEvent & { currentTarget: EventTarget & HTMLDivElement },
): void {
  if (event.button !== 0) return
  event.preventDefault()
  event.currentTarget.setPointerCapture(event.pointerId)
  drag = { pointerId: event.pointerId, startY: event.clientY, startHeight: height }
}

/** Supports keyboard resizing for the same handle.
 * @param event Separator key event. @returns Nothing.
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
/** Observe available toolbar space without changing saved coordinate precision.
 * @param node Toolbar element.
 * @param initial Initial toolbar mode and content measurement signature.
 * @returns Mode-change handler and observer cleanup when the toolbar unmounts.
 */
function measureToolbar(
  node: HTMLDivElement,
  initial: string,
): { update: (signature: string) => void; destroy: () => void } | undefined {
  if (typeof ResizeObserver === 'undefined') return
  let frame = 0
  let disposed = false
  let previousWidth = -1
  let mode = initial
  const optionsObserver = new MutationObserver(() => {
    previousWidth = -1
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  })
  /** Measure natural group widths in isolation before committing the visible density.
   * @returns Nothing; unchanged available widths are ignored.
   */
  function measure(): void {
    if (disposed || !node.isConnected) return
    const width = node.clientWidth
    if (!width || width === previousWidth) return
    const location = node.querySelector<HTMLElement>('[data-address-toolbar-location]')
    const address = node.querySelector<HTMLElement>('[data-address-toolbar-display]')
    if (singleRowToolbar && (!location || !address || !measurementElement)) return
    if (singleRowToolbar && location && address && measurementElement) {
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:fixed;left:-100000px;top:0;display:flex;width:max-content;visibility:hidden;pointer-events:none;contain:layout style;'
      probe.inert = true
      probe.setAttribute('aria-hidden', 'true')
      // Clones preserve typography and box sizing without mounting duplicate location editors.
      const settings = node.querySelector<HTMLElement>(
        '[data-address-toolbar-settings]',
      )
      for (const source of [location, address, ...(settings ? [settings] : [])]) {
        const clone = source.cloneNode(true) as HTMLElement
        clone.removeAttribute('id')
        clone
          .querySelectorAll<HTMLElement>('[data-location-options]')
          .forEach(options => {
            options.dataset.compact = 'false'
          })
        clone.querySelectorAll('[id]').forEach(element => {
          element.removeAttribute('id')
        })
        // The stationary address sizing span owns intrinsic width, not the animated duplicate track.
        clone
          .querySelectorAll<HTMLElement>('.bits-scrollable-text')
          .forEach(element => {
            element.style.width = '0px'
          })
        clone.style.cssText =
          'position:static;display:block;visibility:hidden;width:max-content;min-width:0;max-width:none;flex:none;'
        // Measure expanded dropdowns, coordinates and help together, including their internal gaps.
        if (clone.hasAttribute('data-address-toolbar-settings'))
          clone.style.display = 'flex'
        probe.append(clone)
      }
      node.append(probe)
      const styles = getComputedStyle(node)
      const required =
        Array.from(probe.children).reduce(
          (sum, child) => sum + child.getBoundingClientRect().width,
          0,
        ) +
        parseFloat(styles.columnGap) * (probe.children.length - 1) +
        parseFloat(styles.paddingLeft) +
        parseFloat(styles.paddingRight)
      probe.remove()
      controlsCompact = required > width
      coordinatesCompact = true
    } else {
      controlsCompact = width < 800
    }
    previousWidth = width
    toolbarWidth = width
    toolbarMeasured = true
  }
  // Wait for initial DOM and font metrics before revealing the chosen layout.
  let ready = false
  void tick()
    .then(() => document.fonts?.ready)
    .then(() => {
      if (disposed) return
      ready = true
      const options = node.querySelector('[data-location-options]')
      if (options)
        optionsObserver.observe(options, {
          subtree: true,
          childList: true,
          characterData: true,
        })
      frame = requestAnimationFrame(measure)
    })
  const observer = new ResizeObserver(() => {
    if (!ready || node.clientWidth === previousWidth) return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  })
  observer.observe(node)
  return {
    update(signature): void {
      if (mode === signature) return
      const modeChanged = mode.split(':')[0] !== signature.split(':')[0]
      mode = signature
      previousWidth = -1
      if (modeChanged) toolbarMeasured = false
      if (ready)
        void tick().then(() => {
          if (!disposed) frame = requestAnimationFrame(measure)
        })
    },
    destroy: () => {
      disposed = true
      observer.disconnect()
      optionsObserver.disconnect()
      cancelAnimationFrame(frame)
    },
  }
}
</script>

<!-- Bound intrinsic child widths before measuring the toolbar; overflow must not enlarge its flex ancestor. -->
<div
  class="relative w-full max-w-full min-w-0 shrink-0 [contain:inline-size] select-none [&_input]:select-text [&_textarea]:select-text"
  data-address-map-panel
>
  {#if measurementCoordinates}
    <div
      bind:this={measurementElement}
      inert
      aria-hidden="true"
      class="pointer-events-none invisible fixed top-0 -left-[100000px] w-max"
    >
      {@render measurementCoordinates()}
    </div>
  {/if}
  {#if showMap}
    <div
      class="relative"
      style:height={fixedMap ? `min(${height}px, 50vh)` : `${height}px`}
    >
      <div
        id={mapId}
        class="border-border h-full w-full overflow-hidden border-b [&_.bits-feature-map]:min-h-0 [&_.bits-feature-map]:rounded-none"
      >
        {@render map?.()}
      </div>
      {#if locationMapControls}
        <div
          class="pointer-events-none absolute inset-3 z-10 flex items-start justify-end [&>*]:pointer-events-auto"
          data-location-map-controls
        >
          {@render locationMapControls()}
        </div>
      {/if}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
      <!-- biome-ignore lint/a11y/useSemanticElements: This focusable window splitter supports keyboard and pointer resizing, rather than a static thematic break. -->
      <div
        role="separator"
        tabindex="0"
        aria-label={m.feature_address_resize_map()}
        aria-orientation="horizontal"
        aria-controls={mapId}
        aria-valuemin={minimumHeight}
        aria-valuemax={maximumHeight}
        aria-valuenow={height}
        class="hover:bg-primary/15 focus-visible:bg-primary/20 absolute inset-x-0 bottom-[-6px] z-10 flex h-3 cursor-ns-resize touch-none items-center justify-end pr-8 outline-none"
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
        ondblclick={() => resize(320)}
      >
        <span aria-hidden="true" class="bg-foreground/35 h-1 w-10 rounded-full"></span>
      </div>
    </div>
  {/if}
  <div
    use:measureToolbar={`${singleRowToolbar}:${measurementKey}`}
    style:visibility={singleRowToolbar && !toolbarMeasured ? 'hidden' : undefined}
    data-compact={toolbarWidth > 0 && toolbarWidth < 800}
    class="group/address-toolbar relative z-20 {singleRowToolbar &&
    toolbarWidth > 0 &&
    toolbarWidth < 640
      ? 'grid grid-cols-[minmax(0,1fr)_auto]'
      : 'flex'} items-center justify-between gap-x-[clamp(0.5rem,2vw,2rem)] gap-y-3 border-b border-border/60 bg-panel px-6 py-3 {!singleRowToolbar &&
    (locationControl || (isEditing && showLookup))
      ? 'flex-wrap'
      : 'flex-nowrap'}"
  >
    {#if locationActions && isEditing && !singleRowToolbar}
      <div class="min-w-0 flex-1 overflow-x-auto empty:hidden" data-address-map-actions>
        {@render locationActions()}
      </div>
    {/if}
    {#if locationControl}
      <div class={singleRowToolbar ? 'contents' : 'min-w-0 flex-1 basis-64'}>
        {@render locationControl(
          coordinatesInLocationControl && showCoordinates
            ? coordinatesControl
            : undefined,
        )}
      </div>
    {/if}
    <div
      class="flex shrink-0 items-center gap-1 empty:hidden {centerLocationControl
        ? 'absolute top-1/2 right-6 -translate-y-1/2'
        : ''} {singleRowToolbar
        ? 'min-w-0 flex-1 basis-0 justify-end'
        : 'ml-auto'} {singleRowToolbar && toolbarWidth > 0 && toolbarWidth < 640
        ? 'col-start-2 row-start-1'
        : ''}"
      data-address-toolbar-settings
    >
      {#if toolbarControls}
        <div
          class="group/location-options flex shrink-0 items-center gap-1"
          data-location-options
          data-compact={controlsCompact}
        >
          {@render toolbarControls()}
        </div>
      {/if}
      {#if showCoordinates && !coordinatesInLocationControl}
        <div
          data-address-toolbar-coordinates
          class="pointer-events-auto min-w-0 shrink-0 justify-self-start"
        >
          {@render coordinatesControl()}
        </div>
      {/if}
      {@render toolbarInfo?.()}
    </div>
    {#if showLookup && (isEditing || sourceId) && (!isEditing || !showCoordinates)}
      <div
        class={centerLocationControl
          ? 'absolute top-1/2 right-6 -translate-y-1/2'
          : 'shrink-0'}
      >
        <div class="text-foreground inline-flex items-center">
          <SimpleTooltip>
            {#snippet trigger()}
              <button
                type="button"
                disabled={isEditing ? !canLookup || isLoading : !sourceId}
                aria-busy={isEditing && isLoading}
                onclick={() => {
                  if (isEditing) {
                    if (canLookup && !isLoading) onLookup()
                  } else if (sourceId) void copySourceId()
                }}
                aria-label={isEditing
                  ? m.admin__geo_lookup_address_at_location()
                  : copiedId && copiedId === sourceId
                    ? m.feature_address_id_copied()
                    : m.feature_address_copy_id()}
                class="flex size-11 items-center justify-center rounded-full transition hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary {sourceId
                  ? 'text-success'
                  : 'text-muted-foreground'}"
              >
                {#if !isEditing && copiedId && copiedId === sourceId}
                  <CheckIcon class="size-6" aria-hidden="true" />
                {:else}
                  <span
                    aria-hidden="true"
                    class="size-6 bg-current [mask:url(/logos/saanseoi.svg)_center/contain_no-repeat]"
                  ></span>
                {/if}
              </button>
            {/snippet}
            {isEditing
              ? m.admin__geo_lookup_address_at_location()
              : sourceId
                ? `${m.feature_address_copy_id()}: ${sourceId}`
                : m.feature_address_unresolved()}
          </SimpleTooltip>
          <span class="sr-only" role="status"
            >{copyFailed
              ? m.feature_address_copy_failed()
              : copiedId && copiedId === sourceId
                ? m.feature_address_id_copied()
                : ''}</span
          >
        </div>
      </div>
    {/if}
    {#if isEditing && showLookup}
      <div class={locationControl ? 'w-full min-w-0' : 'min-w-0 grow basis-72'}>
        {@render lookupControl()}
      </div>
    {/if}
  </div>
  <!-- Keep discovery actions outside the measured identity/address row so they cannot collapse to zero width. -->
  {#if locationActions && isEditing && singleRowToolbar}
    <div
      class="border-border/60 bg-panel flex flex-wrap gap-2 border-b px-6 py-3 empty:hidden"
      data-address-map-actions
    >
      {@render locationActions()}
    </div>
  {/if}
</div>
