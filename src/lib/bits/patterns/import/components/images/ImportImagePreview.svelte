<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// PATTERN COMPONENTS
import Image from '$lib/bits/patterns/images/Image.svelte'

type Props = {
  file: File
  alt?: string
  class?: string
}

type PreviewUrlEntry = {
  url: string
  refCount: number
  revokeTimer: ReturnType<typeof setTimeout> | null
}

const PREVIEW_URL_REVOKE_DELAY_MS = 30_000
const previewUrlEntries = new WeakMap<File, PreviewUrlEntry>()

let { file, alt = file.name, class: className = '' }: Props = $props()

let previewUrl = $state<string | null>(null)

/**
 * Reuses an object URL per File so upload-state updates do not force the
 * browser to reload the same local image preview.
 *
 * @param imageFile Local image file represented by this preview.
 * @returns Stable object URL for the file.
 */
function acquirePreviewUrl(imageFile: File): string {
  const existingEntry = previewUrlEntries.get(imageFile)

  if (existingEntry) {
    if (existingEntry.revokeTimer) {
      clearTimeout(existingEntry.revokeTimer)
      existingEntry.revokeTimer = null
    }

    existingEntry.refCount += 1
    return existingEntry.url
  }

  const entry: PreviewUrlEntry = {
    url: URL.createObjectURL(imageFile),
    refCount: 1,
    revokeTimer: null,
  }

  previewUrlEntries.set(imageFile, entry)
  return entry.url
}

/**
 * Releases a preview URL after a short grace period so fast row remounts can
 * keep using the same decoded local image without flicker.
 *
 * @param imageFile Local image file represented by this preview.
 * @returns Nothing.
 */
function releasePreviewUrl(imageFile: File): void {
  const entry = previewUrlEntries.get(imageFile)
  if (!entry) return

  entry.refCount = Math.max(0, entry.refCount - 1)
  if (entry.refCount > 0) return

  entry.revokeTimer = setTimeout(() => {
    if (entry.refCount > 0) return

    URL.revokeObjectURL(entry.url)
    previewUrlEntries.delete(imageFile)
  }, PREVIEW_URL_REVOKE_DELAY_MS)
}

$effect(() => {
  const imageFile = file
  previewUrl = acquirePreviewUrl(imageFile)

  return () => {
    releasePreviewUrl(imageFile)
  }
})

const rootClass = $derived(
  cx(
    'size-24 overflow-hidden border-r border-base-content/10 bg-base-200/60',
    className,
  ),
)
</script>

<div class={rootClass}>
  {#if previewUrl}
    <Image
      src={previewUrl}
      {alt}
      fit="cover"
      rounded="rounded-l-xl rounded-r-none"
      showBackdrop={false}
      enableSourceTransition={false}
      class="h-full w-full"
    />
  {/if}
</div>
