<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// COMPONENTS
import CatalogPreview from '#lib/bits/patterns/messaging/CatalogPreview.svelte'
import MediaSkeleton from '#lib/bits/patterns/messaging/MediaSkeleton.svelte'
// TYPES
import type { WhatsAppContent } from '#lib/api/services/whatsover.types.js'

interface Props {
  content: WhatsAppContent
  url?: string
  error?: string
  onLoad: () => Promise<void>
  transitionName?: string
  revision?: number
}
let { content, url, error, onLoad, transitionName, revision = 0 }: Props = $props()
let preview = $state<HTMLDialogElement>()
let frame = $state<HTMLDivElement>()
let loading = $state(false)
let attemptedRevision = ''
const automatic = $derived(
  ['image', 'sticker', 'audio', 'video'].includes(content.kind),
)
const label = $derived(
  content.kind === 'audio' && content.voiceNote
    ? 'Voice message'
    : content.kind.charAt(0).toUpperCase() + content.kind.slice(1),
)

let previewTransition: Promise<void> | undefined

/** Match the thumbnail and enlarged image across modal changes.
 * @param open Whether to open the preview.
 * @returns Completion of the animation and restoration of transition styles.
 */
async function setPreview(open: boolean): Promise<void> {
  if (previewTransition) await previewTransition
  const dialog = preview
  if (!dialog || dialog.open === open) return
  const thumbnail = frame?.querySelector<HTMLImageElement>('button img')
  const enlarged = dialog.querySelector<HTMLImageElement>('img')
  const update = (): void => {
    if (open) dialog.showModal()
    else dialog.close()
  }
  if (
    !thumbnail ||
    !enlarged ||
    !document.startViewTransition ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    update()
    return
  }
  const source = open ? thumbnail : enlarged
  const destination = open ? enlarged : thumbnail
  source.style.viewTransitionName = 'chat-image-preview'
  const transition = document.startViewTransition(() => {
    source.style.viewTransitionName = ''
    destination.style.viewTransitionName = 'chat-image-preview'
    update()
  })
  previewTransition = transition.finished
    .catch(() => {})
    .finally(() => {
      source.style.viewTransitionName = ''
      destination.style.viewTransitionName = ''
      previewTransition = undefined
    })
  await previewTransition
}

/** Request this attachment once at a time; the adapter owns bytes and object URLs.
 * @returns Completion of the adapter's load attempt.
 */
async function load(): Promise<void> {
  if (loading || url || content.viewOnce) return
  loading = true
  try {
    await onLoad()
  } finally {
    loading = false
  }
}

$effect(() => {
  const element = frame,
    current = content
  const currentRevision = JSON.stringify([
    revision,
    current.kind,
    current.mimeType,
    current.byteLength,
    current.fileName,
  ])
  if (!element || !automatic || current.viewOnce || url || error || loading) return
  if (attemptedRevision === currentRevision) return
  const request = (): void => {
    attemptedRevision = currentRevision
    void load()
  }
  // Fetch only media approaching the visible conversation, for either sender direction.
  // Reobserve when an edit replaces media under the same native message identity.
  if (typeof IntersectionObserver === 'undefined') {
    untrack(request)
    return
  }
  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      request()
    },
    { root: element.closest('[role="log"]'), rootMargin: '160px 0px' },
  )
  observer.observe(element)
  return () => observer.disconnect()
})
</script>

<div
  bind:this={frame}
  style:view-transition-name={transitionName}
  class="flex max-w-full flex-col gap-2 {content.kind === 'sticker' ? 'w-48' : 'w-80'}"
  aria-busy={loading}
>
  {#if url}
    {#if content.animated ||
      (content.kind === 'sticker' &&
        ['video/webm', 'application/x-tgsticker'].includes(content.mimeType ?? ''))}
      <div class="aspect-square max-h-96 w-full">
        <CatalogPreview
          {url}
          mimeType={content.mimeType ?? 'video/mp4'}
          label={content.kind === 'sticker' ? 'Chat sticker' : 'GIF'}
        />
      </div>
    {:else if content.kind === 'image' || content.kind === 'sticker'}
      <button
        type="button"
        aria-label="Open image preview"
        class="focus-visible:outline-primary block w-full cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
        onclick={() => void setPreview(true)}
      >
        <img
          src={url}
          alt={content.text ||
            (content.kind === 'sticker' ? 'Chat sticker' : 'Chat image')}
          class="max-h-96 w-full rounded-lg object-contain"
          loading="lazy"
        >
      </button>
      <!-- biome-ignore lint/a11y/useKeyWithClickEvents: Native dialog cancel handles Escape; the close button is keyboard accessible. -->
      <dialog
        bind:this={preview}
        aria-label="Image preview"
        class="fixed inset-0 m-auto max-h-[100dvh] max-w-[100vw] overflow-visible border-0 bg-transparent p-0 text-white backdrop:bg-black/85"
        onclick={event => {
          if (event.target === preview) void setPreview(false)
        }}
        oncancel={event => {
          event.preventDefault()
          void setPreview(false)
        }}
      >
        <div
          class="relative flex max-h-[100dvh] max-w-[100vw] items-center justify-center p-12"
        >
          <button
            type="button"
            aria-label="Close image preview"
            class="absolute top-2 right-2 flex size-10 items-center justify-center rounded-full bg-black/70 text-2xl focus-visible:outline-2 focus-visible:outline-white"
            onclick={() => void setPreview(false)}
          >
            ×
          </button>
          <img
            src={url}
            alt={content.text ||
              (content.kind === 'sticker' ? 'Chat sticker' : 'Chat image')}
            class="max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-6rem)] object-contain"
          >
        </div>
      </dialog>
    {:else if content.kind === 'audio'}
      <!-- biome-ignore lint/a11y/useMediaCaption: Provider voice messages do not include transcripts or caption tracks. -->
      <audio
        controls
        preload="metadata"
        src={url}
        class="w-full min-w-0"
        aria-label="Voice message"
      ></audio>
    {:else if content.kind === 'video'}
      <video controls preload="metadata" src={url} class="max-h-96 w-full rounded-lg">
        <track kind="captions">
      </video>
    {:else}
      <a
        href={url}
        download={content.fileName || 'attachment'}
        class="break-words underline"
        >Download {content.fileName || 'document'}</a
      >
    {/if}
  {:else}
    {#if !error && (automatic || loading)}
      <MediaSkeleton
        label={`Loading ${label.toLowerCase()} preview`}
        compact={content.kind === 'audio' || content.kind === 'document'}
      />
      <span role="status" class="sr-only"
        >{loading ? 'Loading…' : 'Waiting to load…'}</span
      >
    {:else}
      <div
        class="flex flex-col items-center justify-center gap-2 rounded-lg bg-surface p-3 text-muted-foreground {content.kind ===
          'image' ||
        content.kind === 'sticker' ||
        content.kind === 'video'
          ? 'aspect-square'
          : 'min-h-16'}"
      >
        <span>{label}{content.duration ? ` · ${content.duration}s` : ''}</span>
        {#if error}
          <Button
            text="Retry media"
            style="soft"
            disabled={loading}
            onClick={() => void load()}
          />
        {:else if automatic}
          <MediaSkeleton label="Loading preview" compact />
        {:else}
          <Button
            text="Load document"
            style="soft"
            disabled={loading}
            onClick={() => void load()}
          />
        {/if}
      </div>
    {/if}
  {/if}
  {#if error}
    <p role="alert" class="text-muted-foreground text-xs break-words">{error}</p>
  {/if}
</div>

<style>
:global(::view-transition-group(chat-image-preview)) {
  animation-duration: 260ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
:global(::view-transition-old(chat-image-preview)),
:global(::view-transition-new(chat-image-preview)) {
  height: 100%;
  object-fit: contain;
}
</style>
