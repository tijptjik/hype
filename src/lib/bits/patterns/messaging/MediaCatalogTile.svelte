<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// COMPONENTS
import CatalogPreview from './CatalogPreview.svelte'
import MediaSkeleton from './MediaSkeleton.svelte'
// TYPES
import type { MediaCatalogItem, MediaPickerModel } from '#lib/messaging/media-catalog.js'

let { item, model, disabled }: { item: MediaCatalogItem; model: MediaPickerModel; disabled: boolean } = $props()
let tile: HTMLDivElement

onMount(() => {
  if (typeof IntersectionObserver === 'undefined') { void model.preview(item); return }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return
    observer.disconnect(); void model.preview(item)
  }, { root: tile.closest('[data-media-results]'), rootMargin: '80px' })
  observer.observe(tile)
  return () => observer.disconnect()
})
</script>

<div bind:this={tile} class="min-w-0">
  <button type="button" aria-label={`Send ${item.title}`} {disabled} onclick={event => void model.select(item, event.currentTarget)} class="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-surface p-1 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">
    {#if model.urls[item.id]}<CatalogPreview url={model.urls[item.id]} mimeType={item.mimeType} label={item.title} />
    {:else if model.previewErrors[item.id]}<span class="p-2 text-center text-xs text-muted-foreground">Preview unavailable</span>
    {:else}<MediaSkeleton />{/if}
  </button>
  {#if !['GIF', 'Sticker'].includes(item.title)}<p class="mt-1 whitespace-normal break-words text-center text-xs text-muted-foreground">{item.title}</p>{/if}
  {#if model.previewErrors[item.id]}<button type="button" class="w-full py-1 text-xs underline" onclick={() => void model.preview(item)}>Retry preview</button>{/if}
</div>
