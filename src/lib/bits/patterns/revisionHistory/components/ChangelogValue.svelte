<script lang="ts">
// COMPONENTS
import HistoryValue from './HistoryValue.svelte'
// TYPES
import type { ChangelogEntry } from '#lib/revisions/changelog.js'
import type { RevisionDifference } from '#lib/revisions/diff.js'
import type { RevisionSlot } from '#lib/revisions/value.js'

let {
  entry,
  change,
  side,
}: {
  entry: ChangelogEntry
  change: RevisionDifference
  side: 'before' | 'after'
} = $props()
const slot = $derived(change[side])

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
</script>

{#if src && failedSource !== src}
  <img
    {src}
    alt={side === 'before' ? 'Previous image' : 'Updated image'}
    class="border-border/50 max-h-64 max-w-full rounded-md border object-contain"
    loading="lazy"
    onerror={() => {
      failedSource = src
    }}
  >
  <details class="text-muted-foreground mt-2 text-xs">
    <summary class="w-fit cursor-pointer">Image reference</summary>
    <div class="mt-2"><HistoryValue {slot} /></div>
  </details>
{:else}
  {#if image}
    <p class="text-muted-foreground mb-2 text-xs">
      {src ? 'Historical image unavailable' : 'Exact historical preview unavailable'}
    </p>
  {/if}
  <HistoryValue {slot} />
{/if}
