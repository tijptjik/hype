<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
// COMPONENTS
import CatalogPreview from './CatalogPreview.svelte'
import MediaSkeleton from './MediaSkeleton.svelte'
// TYPES
import type {
  MediaCatalogItem,
  MediaPickerModel,
} from '#lib/messaging/media-catalog.js'

let {
  item,
  model,
  disabled,
  onPreview,
}: {
  item: MediaCatalogItem
  model: MediaPickerModel
  disabled: boolean
  onPreview: (item: MediaCatalogItem, source: HTMLButtonElement) => void
} = $props()
let tile: HTMLDivElement
let hold: ReturnType<typeof setTimeout> | undefined
let origin = { x: 0, y: 0 }
let previewed = false
function cancelHold(): void {
  clearTimeout(hold)
  hold = undefined
}
onDestroy(cancelHold)
function startHold(event: PointerEvent): void {
  if (disabled || event.button !== 0) return
  cancelHold()
  previewed = false
  origin = { x: event.clientX, y: event.clientY }
  const source = event.currentTarget as HTMLButtonElement
  hold = setTimeout(() => {
    previewed = true
    onPreview(item, source)
  }, 450)
}

onMount(() => {
  if (typeof IntersectionObserver === 'undefined') {
    void model.preview(item)
    return
  }
  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      void model.preview(item)
    },
    { root: tile.closest('[data-media-results]'), rootMargin: '80px' },
  )
  observer.observe(tile)
  return () => observer.disconnect()
})
</script>

<div bind:this={tile} class="min-w-0">
  <button
    type="button"
    aria-label={`Send ${item.title}`}
    {disabled}
    onpointerdown={startHold}
    onpointerup={cancelHold}
    onpointercancel={cancelHold}
    onpointerleave={cancelHold}
    onpointermove={event => {
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10)
        cancelHold()
    }}
    oncontextmenu={event => {
      event.preventDefault()
      cancelHold()
      previewed = true
      onPreview(item, event.currentTarget)
    }}
    onkeydown={event => {
      if (event.key === 'Enter' && event.altKey) {
        event.preventDefault()
        onPreview(item, event.currentTarget)
      }
    }}
    ondragstart={event => event.preventDefault()}
    aria-keyshortcuts="Alt+Enter"
    title="Click to send · Hold to preview"
    onclick={event => {
      if (previewed) {
        previewed = false
        event.preventDefault()
        return
      }
      void model.select(item, event.currentTarget)
    }}
    class="bg-surface hover:bg-raised focus-visible:outline-primary flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg p-1 select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
  >
    {#if model.urls[item.id]}
      <CatalogPreview
        url={model.urls[item.id]}
        mimeType={item.mimeType}
        label={item.title}
        playbackLimit={item.kind === 'gif' ? 1 : undefined}
      />
    {:else if model.previewErrors[item.id]}
      <span class="text-muted-foreground p-2 text-center text-xs"
        >Preview unavailable</span
      >
    {:else}
      <MediaSkeleton />
    {/if}
  </button>
  {#if !['GIF', 'Sticker'].includes(item.title)}
    <p
      class="text-muted-foreground mt-1 text-center text-xs break-words whitespace-normal"
    >
      {item.title}
    </p>
  {/if}
  {#if model.previewErrors[item.id]}
    <button
      type="button"
      class="w-full py-1 text-xs underline"
      onclick={() => void model.preview(item)}
    >
      Retry preview
    </button>
  {/if}
</div>
