<script lang="ts">
// SVELTE
import { onDestroy, type Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import CheckIcon from 'virtual:icons/proicons/checkmark'

let {
  map,
  coordinatesControl,
  lookupControl,
  onLookup,
  canLookup,
  isEditing,
  isLoading,
  sourceId = null,
}: {
  coordinatesControl: Snippet
  lookupControl: Snippet
  sourceId?: string | null
  map: Snippet
  onLookup: () => void
  canLookup: boolean
  isEditing: boolean
  isLoading: boolean
} = $props()

let copiedId = $state<string | null>(null)
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
</script>

<div class="relative w-full">
  <div class="relative" style:height={`${height}px`}>
    <div
      id={mapId}
      class="h-full w-full overflow-hidden border-b border-border [&_.bits-feature-map]:min-h-0 [&_.bits-feature-map]:rounded-none"
    >
      {@render map()}
    </div>
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
      class="absolute inset-x-0 bottom-[-6px] z-10 flex h-3 touch-none cursor-ns-resize items-center justify-end pr-8 outline-none hover:bg-primary/15 focus-visible:bg-primary/20"
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
      <span aria-hidden="true" class="h-1 w-10 rounded-full bg-foreground/35"></span>
    </div>
  </div>
  <div
    class="pointer-events-none absolute inset-x-0 bottom-0 z-20 grid translate-y-1/2 grid-cols-[minmax(max-content,1fr)_auto_minmax(0,max-content)] items-center gap-3 px-6 @max-[1100px]:relative @max-[1100px]:translate-y-0 @max-[1100px]:grid-cols-1 @max-[1100px]:py-3"
  >
    <div class="pointer-events-auto min-w-0 justify-self-start">
      {@render coordinatesControl()}
    </div>
    <div class="pointer-events-auto justify-self-center">
      <div
        class="inline-flex min-h-11 items-center gap-1 rounded-full border border-[color:color-mix(in_oklab,var(--color-foreground)_12%,transparent)] bg-panel px-2.5 py-1 text-foreground backdrop-blur-[14px]"
      >
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
    <div
      class="pointer-events-auto w-max min-w-80 max-w-full justify-self-end @max-[400px]:min-w-0"
    >
      {@render lookupControl()}
    </div>
  </div>
</div>
