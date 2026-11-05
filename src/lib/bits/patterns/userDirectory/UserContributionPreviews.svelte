<script lang="ts">
// SVELTE
import { goto } from '$app/navigation'
import { untrack } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
// BITS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// API
import { getUserContributionPreviews } from '#lib/api/user.remote.js'
// SERVICES
import { getImageSrc } from '#lib/client/services/image.js'
// ICONS
import PhotoIcon from 'virtual:icons/lucide/camera'
import FeatureIcon from 'virtual:icons/proicons/location'
import ArrowIcon from 'virtual:icons/proicons/chevron-right'
// TYPES
import type { UserContributionPreview } from '#lib/users/contributionPreview.types.js'

type Tile = UserContributionPreview & { src: string | null }
let {
  profile,
  initialPreviews,
  onMore,
}: {
  profile: { id: string }
  initialPreviews?: UserContributionPreview[]
  onMore: () => void
} = $props()
let tiles = $state<Tile[]>([])
let loading = $state(true)
const loadedThumbnails = new SvelteSet<string>()
const failedThumbnails = new SvelteSet<string>()
let failed = $state(false)
let width = $state(800)
const profileId = $derived(profile.id)
const suppliedPreviews = $derived(initialPreviews)
const capacity = $derived(Math.max(1, Math.min(7, Math.floor((width - 80) / 160))))
// A full preview may have more history; no complete contribution list is needed here.
const hasMore = $derived(tiles.length === 7 || tiles.length > capacity)

// Fetch the strip's seven previews together, never hydrate individual feature graphs.
$effect(() => {
  const userId = profileId
  const supplied = suppliedPreviews
  let active = true
  loading = true
  tiles = []
  failed = false
  untrack(() => {
    if (supplied !== undefined) {
      tiles = supplied.map(tile => ({ ...tile, src: getImageSrc(tile.image) }))
      loading = false
      return
    }
    void getUserContributionPreviews({ userId })
      .then(result => {
        if (active)
          tiles = result.map(tile => ({ ...tile, src: getImageSrc(tile.image) }))
      })
      .catch(() => {
        if (active) failed = true
      })
      .finally(() => {
        if (active) loading = false
      })
  })
  return () => {
    active = false
  }
})
</script>

<section
  bind:clientWidth={width}
  class="bg-panel flex h-full min-w-0 flex-1 overflow-hidden"
  aria-label="Contribution previews"
  aria-busy={loading}
>
  {#if loading}
    <span role="status" class="sr-only">Loading contributions…</span>
    {#each Array(capacity) as _, index (index)}
      <div
        aria-hidden="true"
        class="border-border/40 bg-primary/3 relative h-full min-w-0 flex-1 overflow-hidden border-r"
      >
        <div class="absolute inset-0 flex items-center justify-center pb-8">
          <Skeleton class="bg-primary/10 size-12 rounded-xl" />
        </div>
        <div class="absolute inset-x-0 bottom-0 flex items-end gap-2 p-3">
          <Skeleton class="bg-primary/10 size-7 shrink-0 rounded-full" />
          <div class="min-w-0 flex-1 space-y-2 pb-1">
            <Skeleton class="bg-primary/10 h-2.5 w-4/5" />
            <Skeleton class="bg-primary/7 h-2 w-3/5" />
          </div>
        </div>
      </div>
    {/each}
    <div
      aria-hidden="true"
      class="bg-panel flex w-20 shrink-0 flex-col items-center justify-center gap-3"
    >
      <Skeleton class="bg-primary/10 size-4" />
      <Skeleton class="bg-primary/10 h-2.5 w-8" />
    </div>
  {:else if !tiles.length}
    <p class="text-muted-foreground m-auto p-6 text-sm">
      {failed
        ? 'Unable to load contribution previews.'
        : 'No published contributions yet.'}
    </p>
  {:else}
    {#each tiles.slice(0, capacity) as tile (`${tile.kind}-${tile.imageId ?? tile.id}`)}
      <button
        type="button"
        class="group border-border/40 focus-visible:outline-primary relative h-full min-w-0 flex-1 overflow-hidden border-r text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
        aria-label={`${tile.title || 'Feature'} · ${tile.kind === 'photo' ? 'Photo contribution' : 'Feature contribution'}`}
        onclick={() =>
          goto(
            `/admin/features/${encodeURIComponent(tile.featureId)}${tile.imageId ? `?imageId=${encodeURIComponent(tile.imageId)}` : ''}`,
          )}
      >
        {#if tile.src && !failedThumbnails.has(tile.src)}
          {#if !loadedThumbnails.has(tile.src)}
            <Skeleton class="bg-primary/10 absolute inset-0 size-full rounded-none" />
          {/if}
          <img
            src={tile.src}
            alt=""
            class="relative size-full object-cover transition-[opacity,transform] group-hover:scale-105"
            class:opacity-0={!loadedThumbnails.has(tile.src)}
            onload={() => {
              if (tile.src) loadedThumbnails.add(tile.src)
            }}
            onerror={() => {
              if (tile.src) failedThumbnails.add(tile.src)
            }}
          >
        {:else}
          <div class="bg-primary/5 flex size-full items-center justify-center">
            <FeatureIcon class="text-muted-foreground/40 size-10" />
          </div>
        {/if}
        <div
          class="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-white"
        >
          <span
            class="bg-panel text-foreground flex size-7 shrink-0 items-center justify-center rounded-full"
            title={tile.kind === 'photo'
              ? 'Photo contribution'
              : 'Feature contribution'}
            >{#if tile.kind === 'photo'}
              <PhotoIcon class="size-4" />
            {:else}
              <FeatureIcon class="size-4" />
            {/if}</span
          >
          <span class="min-w-0 text-sm font-medium break-words"
            >{tile.title || 'Feature'}</span
          >
        </div>
      </button>
    {/each}
  {/if}
  {#if hasMore || failed}
    <button
      type="button"
      class="bg-panel hover:bg-primary/10 focus-visible:outline-primary flex w-20 shrink-0 flex-col items-center justify-center gap-2 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2"
      onclick={onMore}
    >
      <ArrowIcon class="size-5" />More
    </button>
  {/if}
</section>
