<script lang="ts">
// COMPONENTS
import HistoryValue from './HistoryValue.svelte'
import ChangelogCoordinateMap from './ChangelogCoordinateMap.svelte'
// PRESENTATION
import { revisionCoordinates } from '#lib/revisions/coordinateChange.js'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// TYPES
import type { ChangelogEntry } from '#lib/revisions/changelog.js'
import type { RevisionDifference } from '#lib/revisions/diff.js'
import type { RevisionSlot } from '#lib/revisions/value.js'

let {
  entry,
  change,
  side,
  metadataOpen = false,
}: {
  entry: ChangelogEntry
  change: RevisionDifference
  side: 'before' | 'after'
  metadataOpen?: boolean
} = $props()
const slot = $derived(change[side])
const coordinates = $derived(revisionCoordinates(change.path, slot))
/** Read an immutable image pin without interpreting arbitrary text as an image.
 * @param value Privacy-filtered historical value.
 * @returns Image identity and revision when explicitly recorded together.
 */
function pin(
  value: RevisionSlot,
): { imageId: string; revisionId: string | null } | null {
  if (
    !value.present ||
    !value.value ||
    typeof value.value !== 'object' ||
    Array.isArray(value.value)
  )
    return null
  const object = value.value
  if (typeof object.imageId !== 'string') return null
  return {
    imageId: object.imageId,
    revisionId:
      typeof object.imageRevisionId === 'string' ? object.imageRevisionId : null,
  }
}

const image = $derived.by(() => {
  const direct = pin(slot)
  if (direct) return direct
  if (!slot.present || typeof slot.value !== 'string' || !slot.value) return null
  if (change.path.at(-1) === 'imageRevisionId')
    return { imageId: '', revisionId: slot.value }
  if (change.path.at(-1) !== 'imageId') return null
  // Reuse only matching evidence from the same side of this authorized change.
  for (const sibling of entry.changes) {
    const candidate = pin(sibling[side])
    if (candidate?.imageId === slot.value && candidate.revisionId) return candidate
  }
  return { imageId: slot.value, revisionId: null }
})
const src = $derived(
  image?.revisionId
    ? '/api/images/revisions/' +
        encodeURIComponent(image.revisionId) +
        '?' +
        new URLSearchParams({
          t: 'c_fit,w_480,h_320',
          ...(entry.resourceType === 'feature' ? { feature: entry.resourceId } : {}),
        })
    : null,
)
let failedSource = $state<string | null>(null)
let loadedSource = $state<string | null>(null)
</script>

{#if coordinates}
  <ChangelogCoordinateMap {change} {coordinates} {side} />
{:else if src && failedSource !== src}
  {#key src}
    <div
      class="border-border/50 relative h-64 w-96 max-w-full overflow-hidden rounded-md border"
      aria-busy={loadedSource !== src}
    >
      {#if loadedSource !== src}
        <Skeleton class="absolute inset-0 size-full" />
      {/if}
      <img
        {src}
        alt={side === 'before' ? 'Previous image' : 'Updated image'}
        class="relative size-full object-contain"
        class:opacity-0={loadedSource !== src}
        loading="lazy"
        onload={() => {
          loadedSource = src
        }}
        onerror={() => {
          failedSource = src
        }}
      >
    </div>
  {/key}
  {#if metadataOpen}
    <div class="text-muted-foreground mt-2 text-xs"><HistoryValue {slot} /></div>
  {/if}
{:else}
  {#if image}
    <p class="text-muted-foreground mb-2 text-xs">
      {src ? 'Historical image unavailable' : 'Exact historical preview unavailable'}
    </p>
  {/if}
  {#if !image || metadataOpen}
    <HistoryValue {slot} path={change.path} />
  {/if}
{/if}
