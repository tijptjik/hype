<script lang="ts">
// ICONS
import TrashIcon from 'virtual:icons/lucide/trash-2'
import UploadIcon from 'virtual:icons/lucide/upload'
import XIcon from 'virtual:icons/lucide/x'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// COMPONENTS
import MediaCatalogTile from './MediaCatalogTile.svelte'
import MediaSkeleton from './MediaSkeleton.svelte'
// TYPES
import type { MediaPickerModel } from '#lib/messaging/media-catalog.js'

let {
  model,
  disabled = false,
  onUploadSticker,
}: {
  model: MediaPickerModel
  disabled?: boolean
  onUploadSticker: () => void
} = $props()
let dialog: HTMLDialogElement
let search: HTMLInputElement

$effect(() => {
  if (model.open && !dialog.open) {
    dialog.showModal()
    search.focus()
  } else if (!model.open && dialog.open) dialog.close()
})
</script>

<!-- biome-ignore lint/a11y/useKeyWithClickEvents: Native dialog cancel handles Escape; the close button is keyboard accessible. -->
<dialog
  bind:this={dialog}
  aria-label="GIF and sticker picker"
  oncancel={() => model.close()}
  onclose={() => {
    if (model.open) model.close()
  }}
  onclick={event => {
    if (event.target === dialog) model.close()
  }}
  class="fixed inset-0 z-50 m-auto max-h-[85dvh] w-[min(44rem,calc(100vw-1.5rem))] max-w-none overflow-hidden rounded-xl border border-border bg-panel p-0 text-base-content shadow-xl backdrop:bg-black/50"
>
  <div class="flex max-h-[calc(85dvh-2px)] min-h-0 flex-col gap-3 p-4">
    <div class="flex shrink-0 items-center justify-between gap-3">
      <fieldset aria-label="Media type" class="flex gap-2">
        <button
          type="button"
          aria-pressed={model.kind === 'gif'}
          class="rounded-lg px-3 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-content"
          onclick={() => model.show('gif')}
        >
          GIFs
        </button>
        <button
          type="button"
          aria-pressed={model.kind === 'sticker'}
          class="rounded-lg px-3 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-content"
          onclick={() => model.show('sticker')}
        >
          Stickers
        </button>
      </fieldset>
      <Button
        text="Close picker"
        iconComponent={XIcon}
        hideLabel
        hideLabelInstantly
        modifier="circle"
        style="ghost"
        size="sm"
        attrs={{ title: 'Close picker' }}
        onClick={() => model.close()}
      />
    </div>
    {#if model.kind === 'sticker' && model.packs.length}
      <fieldset
        class="flex shrink-0 gap-2 overflow-x-auto pb-2 pt-1"
        aria-label="Sticker packs"
      >
        <button
          type="button"
          class="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs aria-pressed:bg-raised"
          aria-pressed={!model.pack}
          onclick={() => model.choosePack('')}
        >
          Recent
        </button>
        {#each model.packs as pack (pack.id)}
          <button
            type="button"
            class="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs aria-pressed:bg-primary aria-pressed:text-primary-content"
            aria-pressed={model.pack === pack.id}
            onclick={() => model.choosePack(pack.id)}
          >
            {pack.title}
          </button>
        {/each}
      </fieldset>
    {/if}
    <label class="flex shrink-0 flex-col gap-1 text-sm">
      <span>{model.kind === 'gif' ? 'Search GIFs' : 'Search stickers'}</span>
      <input
        bind:this={search}
        type="search"
        value={model.query}
        maxlength="200"
        placeholder={model.kind === 'gif' ? 'Search GIFs…' : 'Try a word or emoji…'}
        class="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-offset-2 focus-visible:outline-primary"
        oninput={event => model.search(event.currentTarget.value)}
        onkeydown={event => {
          if (event.key === 'Enter') event.preventDefault()
        }}
      >
    </label>
    <div
      data-media-results
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      aria-busy={model.loading}
    >
      {#if !model.query && !model.pack}
        <p class="mb-3 text-xs text-muted-foreground">
          {model.kind === 'gif'
            ? 'Saved GIFs · Search for more'
            : 'Recent stickers · Search for more'}
        </p>
      {/if}
      <div
        class="grid grid-cols-3 gap-3 min-[480px]:grid-cols-4 min-[720px]:grid-cols-6"
      >
        {#each model.items as item (item.key)}
          <MediaCatalogTile {item} {model} {disabled} />
        {/each}
        {#if model.loading && !model.items.length}
          {#each Array(12) as _}
            <MediaSkeleton label="Loading results" />
          {/each}
        {/if}
      </div>
      {#if model.loading}
        <p role="status" class="sr-only">Searching…</p>
      {:else if model.error}
        <div role="alert" class="py-4 text-sm">
          <p>{model.error}</p>
          <Button text="Retry search" style="soft" onClick={() => void model.retry()} />
        </div>
      {:else if !model.items.length}
        <p role="status" class="py-6 text-center text-sm text-muted-foreground">
          {model.query
            ? 'No results. Try another word or emoji.'
            : 'Search to find something to share.'}
        </p>
      {/if}
      {#if model.hasMore}
        <div class="mt-3 flex justify-center">
          <Button
            text="Load more"
            style="soft"
            disabled={model.loading || disabled}
            onClick={() => void model.more()}
          />
        </div>
      {/if}
    </div>
    {#if model.pack}
      <div class="flex shrink-0 items-center justify-between gap-2 text-xs">
        <span role="status"
          >{model.cacheStatus || 'Keep this pack ready on this device.'}</span
        ><Button
          text={model.saving ? 'Saving…' : 'Save offline'}
          style="ghost"
          disabled={model.saving || model.loading || !model.items.length}
          onClick={() => void model.savePack()}
        />
      </div>
    {/if}
    <p class="sr-only">Select a result to send it instantly.</p>
    <div
      class="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground"
    >
      {#if model.kind === 'sticker'}
        <Button
          text="Upload sticker"
          iconComponent={UploadIcon}
          hideLabel
          hideLabelInstantly
          modifier="circle"
          style="ghost"
          size="sm"
          attrs={{ title: 'Upload sticker' }}
          {disabled}
          onClick={() => {
            model.close()
            onUploadSticker()
          }}
        />
      {/if}
      <div class="ml-auto flex items-center gap-1">
        <span role="img" aria-label="Cache used" class="tabular-nums"
          >{model.cacheBytes === null
            ? '—'
            : model.cacheBytes === 0
              ? '0'
              : model.cacheBytes < 100_000
                ? '<0.1'
                : (model.cacheBytes / 1_000_000).toFixed(1)}
          MB</span
        >
        <Button
          text="Clear cache"
          iconComponent={TrashIcon}
          hideLabel
          hideLabelInstantly
          modifier="circle"
          style="ghost"
          size="sm"
          attrs={{ title: 'Clear cache' }}
          disabled={model.clearingCache}
          onClick={() => void model.clearCache()}
        />
      </div>
    </div>
  </div>
</dialog>

<style>
:global(::view-transition-group(catalog-send)) {
  animation-duration: 240ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
:global(::view-transition-old(catalog-send)),
:global(::view-transition-new(catalog-send)) {
  height: 100%;
  object-fit: contain;
}
</style>
