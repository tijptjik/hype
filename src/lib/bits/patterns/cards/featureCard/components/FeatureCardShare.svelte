<script lang="ts">
// SVELTE
import { onDestroy, tick } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
import { fly } from 'svelte/transition'
// MOTION
import { VIEWER_TRANSITION_MS } from '#lib/bits/patterns/images/images.motion'
// BITS
import { cx } from '#lib/bits/utils.js'
// SHARING
import { shareIntent } from '#lib/sharing/resource.js'
import { copyShareText } from '#lib/sharing/clipboard.js'
import { sharingText } from '#lib/sharing/text.js'
// ICONS
import BackIcon from 'virtual:icons/lucide/arrow-left'
import OrganisationIcon from 'virtual:icons/lucide/building-2'
import ProjectIcon from 'virtual:icons/lucide/map'
import LayerIcon from 'virtual:icons/lucide/layers'
import FeatureIcon from 'virtual:icons/lucide/map-pin'
import LinkIcon from 'virtual:icons/lucide/link'
import CheckIcon from 'virtual:icons/lucide/check'
import SadIcon from 'virtual:icons/lucide/frown'
import ShareIcon from 'virtual:icons/lucide/share-2'
import DownloadIcon from 'virtual:icons/lucide/download'
import FacebookIcon from 'virtual:icons/simple-icons/facebook'
import ThreadsIcon from 'virtual:icons/simple-icons/threads'
import XIcon from 'virtual:icons/simple-icons/x'
import InstagramIcon from 'virtual:icons/simple-icons/instagram'
// STYLES
import { shareStyles } from './FeatureCardShare.styles'
// TYPES
import type { ShareResource, ShareTarget } from '#lib/sharing/resource.js'

let {
  target,
  onClose,
  onHeightChange,
}: {
  target: ShareTarget
  onClose: () => void
  onHeightChange?: (height: number) => void
} = $props()
let contentHeight = $state(0)
let section: HTMLElement | undefined = $state()
let exiting = $state(false)
// Include actual padding so the minimum still fits when text or root sizing changes.
$effect(() => {
  if (!section) return
  const style = getComputedStyle(section)
  const padding =
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
  onHeightChange?.(Math.ceil(contentHeight + padding))
})
onDestroy(() => onHeightChange?.(0))
const text = $derived(sharingText())
const resourceIcons = {
  organisation: OrganisationIcon,
  project: ProjectIcon,
  layer: LayerIcon,
  feature: FeatureIcon,
} as const
const ResourceIcon = $derived(resourceIcons[target.kind])
let resource = $state<ShareResource | null>(null)
let loading = $state(true)
let notice = $state('')
let linkCopied = $state(false)
let copyResetTimer: ReturnType<typeof setTimeout> | undefined
onDestroy(() => clearTimeout(copyResetTimer))
let instagram = $state(false)
let busy = $state(false)
let downloadResult = $state<'idle' | 'success' | 'error'>('idle')
let downloadResetTimer: ReturnType<typeof setTimeout> | undefined
let downloadController: AbortController | undefined
onDestroy(() => {
  clearTimeout(downloadResetTimer)
  downloadController?.abort()
})
let shareFile = $state<File | null>(null)
let heading: HTMLHeadingElement
const apiPath = $derived(`/api/share/${target.kind}/${encodeURIComponent(target.ref)}`)
const url = $derived(
  resource ? new URL(resource.path, window.location.origin).href : '',
)
const caption = $derived(
  resource ? `${resource.title}\n${resource.description}\n${url}` : '',
)

$effect(() => {
  const endpoint = apiPath
  const controller = new AbortController()
  resource = null
  loading = true
  notice = ''
  linkCopied = false
  clearTimeout(copyResetTimer)
  instagram = false
  downloadController?.abort()
  clearTimeout(downloadResetTimer)
  downloadResult = 'idle'
  busy = false
  void fetch(endpoint, { signal: controller.signal })
    .then(async response => {
      if (!response.ok) throw new Error('unavailable')
      const data = (await response.json()) as ShareResource
      if (!controller.signal.aborted) resource = data
    })
    .catch(() => {
      if (!controller.signal.aborted) notice = text.unavailable
    })
    .finally(() => {
      if (!controller.signal.aborted) loading = false
    })
  void tick().then(() => heading?.focus({ preventScroll: true }))
  return () => controller.abort()
})

// Prepare the file after Instagram is selected so the final native share keeps user activation.
$effect(() => {
  const endpoint = apiPath
  shareFile = null
  if (!instagram || typeof navigator.canShare !== 'function') return
  const controller = new AbortController()
  void fetch(`${endpoint}?image=1`, { signal: controller.signal })
    .then(async response => {
      if (!response.ok) return
      const blob = await response.blob()
      const file = new File(
        [blob],
        `hype-share.${blob.type === 'image/png' ? 'png' : 'jpg'}`,
        { type: blob.type },
      )
      if (!controller.signal.aborted && navigator.canShare({ files: [file] }))
        shareFile = file
    })
    .catch(() => {
      /* The download and copy controls remain available when file sharing is unsupported. */
    })
  return () => controller.abort()
})

/** Opens native image sharing for supported mobile apps, including Instagram.
 * @returns Completion or an accessible cancellation/failure notice.
 */
async function nativeImageShare(): Promise<void> {
  if (!shareFile) return
  try {
    await navigator.share({ files: [shareFile] })
  } catch (error) {
    notice =
      error instanceof Error && error.name === 'AbortError'
        ? text.cancelled
        : text.failed
  }
}

/** Copies a public URL or caption and reports clipboard failures accessibly.
 * @param value Text to copy.
 * @param inlineSuccess Whether to confirm inside the direct-link button.
 * @returns Completion of the copy operation.
 */
async function copy(value: string, inlineSuccess = false): Promise<void> {
  const endpoint = apiPath
  if (inlineSuccess) {
    clearTimeout(copyResetTimer)
    linkCopied = false
    notice = ''
  }
  try {
    await copyShareText(value)
    // A completed clipboard request must not confirm a subsequently selected resource.
    if (apiPath !== endpoint) return
    if (inlineSuccess) {
      linkCopied = true
      copyResetTimer = setTimeout(() => {
        linkCopied = false
      }, 2400)
    } else {
      notice = text.copied
    }
  } catch {
    if (apiPath === endpoint) notice = text.failed
  }
}

/** Opens the system share sheet from a user gesture.
 * @returns Completion or a non-error cancellation notice.
 */
async function nativeShare(): Promise<void> {
  if (!resource) return
  try {
    await navigator.share({
      title: resource.title,
      text: resource.description,
      url,
    })
  } catch (error) {
    notice =
      error instanceof Error && error.name === 'AbortError'
        ? text.cancelled
        : text.failed
  }
}

/** Downloads the publicly authorized preview through the same-origin image endpoint.
 * @returns Completion of the download, with an accessible failure message.
 */
async function download(): Promise<void> {
  downloadController?.abort()
  const controller = new AbortController()
  downloadController = controller
  clearTimeout(downloadResetTimer)
  downloadResult = 'idle'
  notice = ''
  busy = true
  try {
    const response = await fetch(`${apiPath}?image=1`, { signal: controller.signal })
    if (!response.ok) throw new Error('image unavailable')
    const blob = await response.blob()
    if (controller.signal.aborted) return
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `${target.kind}-${resource?.id ?? 'share'}.${blob.type === 'image/png' ? 'png' : 'jpg'}`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    downloadResult = 'success'
  } catch {
    if (!controller.signal.aborted) downloadResult = 'error'
  } finally {
    if (!controller.signal.aborted) {
      busy = false
      downloadResetTimer = setTimeout(() => {
        downloadResult = 'idle'
      }, 3000)
    }
  }
}
</script>

<section
  bind:this={section}
  transition:fly|global={{
    duration: prefersReducedMotion.current ? 0 : VIEWER_TRANSITION_MS,
    y: 6,
  }}
  onintrostart={() => {
    exiting = false
  }}
  onoutrostart={() => {
    exiting = true
  }}
  inert={exiting}
  class="absolute inset-0 z-30 flex h-full min-h-0 w-full flex-col overflow-y-auto bg-base-200 p-3 text-base-content"
  aria-labelledby="feature-share-heading"
  onkeydown={event => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }}
>
  <div
    bind:clientHeight={contentHeight}
    class="m-auto flex w-full max-w-md shrink-0 flex-col gap-3"
  >
    <div class="bg-base-200 sticky top-0 z-10 flex shrink-0 items-center gap-2">
      <button
        type="button"
        class="hover:bg-base-content/10 focus-visible:outline-primary flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2"
        aria-label={text.close}
        onclick={onClose}
      >
        <BackIcon class="size-5" aria-hidden="true" />
      </button>
      <h2
        bind:this={heading}
        tabindex="-1"
        id="feature-share-heading"
        class="grid min-w-0 flex-1 grid-cols-[auto_1rem_minmax(0,1fr)] items-center gap-2 outline-none"
      >
        <span class="mr-3 text-lg font-semibold">{text.share}</span>
        <ResourceIcon class="text-muted-foreground size-4" aria-hidden="true" />
        <span class="flex min-w-0 flex-col justify-center gap-0.5">
          <span class="text-[10px] font-medium leading-3 text-muted-foreground"
            >{text[target.kind]}</span
          >
          <span
            class="min-w-0 whitespace-normal break-words text-sm font-medium leading-4"
            >{target.title || resource?.title}</span
          >
        </span>
      </h2>
    </div>
    <div class="flex flex-col gap-3">
      {#if loading}
        <p role="status">{text.loading}</p>
      {:else if resource}
        <!-- biome-ignore lint/a11y/useSemanticElements: Sharing groups combine navigation links and actions rather than form fields. -->
        <div
          class="flex flex-col gap-2"
          role="group"
          aria-labelledby="share-socials-heading"
        >
          <h3
            id="share-socials-heading"
            class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase"
          >
            {text.socials}
          </h3>
          <div class="grid grid-cols-2 gap-2">
            {#each [
              {
                id: 'facebook',
                label: 'Facebook',
                icon: FacebookIcon,
                color: shareStyles.facebook,
              },
              { id: 'x', label: 'X', icon: XIcon, color: shareStyles.x },
              {
                id: 'threads',
                label: 'Threads',
                icon: ThreadsIcon,
                color: shareStyles.threads,
              },
            ] as platform}
              <a
                class={`${shareStyles.platform} ${platform.color}`}
                href={shareIntent(
                  platform.id as 'facebook' | 'threads' | 'x',
                  resource.title,
                  url,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <platform.icon aria-hidden="true" class={shareStyles.platformIcon} />
                <span>{platform.label}</span>
              </a>
            {/each}
            <button
              class={`${shareStyles.platform} ${shareStyles.instagram}`}
              type="button"
              aria-expanded={instagram}
              aria-controls="share-instagram-options"
              onclick={() => {
                instagram = !instagram
              }}
            >
              <InstagramIcon class={shareStyles.platformIcon} aria-hidden="true" />
              <span>Instagram</span>
            </button>
          </div>
        </div>

        <!-- Keep the two primary local actions together beneath the platform grid. -->
        <!-- biome-ignore lint/a11y/useSemanticElements: Sharing groups combine navigation links and actions rather than form fields. -->
        <div
          class="border-base-content/10 flex flex-col gap-2 border-t pt-3"
          role="group"
          aria-labelledby="share-direct-heading"
        >
          <h3
            id="share-direct-heading"
            class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase"
          >
            {text.direct}
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <button
              class={cx(
                shareStyles.utility,
                'overflow-hidden transition-[background-color,border-color,color] duration-300 motion-reduce:transition-none',
                downloadResult === 'success' &&
                  'border-primary/40 bg-primary/10 text-primary',
                downloadResult === 'error' && 'border-error/40 bg-error/10 text-error',
              )}
              type="button"
              disabled={busy}
              aria-busy={busy}
              aria-label={downloadResult === 'success'
                ? text.downloadComplete
                : downloadResult === 'error'
                  ? text.downloadFailed
                  : text.download}
              onclick={download}
            >
              <!-- Reserve all result labels so success, failure and retry keep the same footprint. -->
              <span class="grid" aria-hidden="true">
                {#each [
                  { state: 'idle', label: text.download, icon: DownloadIcon },
                  { state: 'success', label: text.downloadComplete, icon: CheckIcon },
                  { state: 'error', label: text.downloadFailed, icon: SadIcon },
                ] as result}
                  <span
                    class={`col-start-1 row-start-1 flex items-center justify-center gap-2.5 transition-[opacity,transform,translate,scale] duration-300 ease-out motion-reduce:transition-none ${downloadResult === result.state ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'}`}
                  >
                    <result.icon class="size-5 shrink-0" />
                    <span>{result.label}</span>
                  </span>
                {/each}
              </span>
            </button>
            <span class="sr-only" role="status"
              >{downloadResult === 'success'
                ? text.downloadComplete
                : downloadResult === 'error'
                  ? text.downloadFailed
                  : ''}</span
            >
            <button
              class={cx(
                shareStyles.utility,
                'overflow-hidden transition-[background-color,border-color,color] duration-300 motion-reduce:transition-none',
                linkCopied && 'border-primary/40 bg-primary/10 text-primary',
              )}
              type="button"
              aria-label={linkCopied ? text.copied : text.copy}
              onclick={() => copy(url, true)}
            >
              <!-- Both states reserve the same space so confirmation never shifts the card. -->
              <span class="grid" aria-hidden="true">
                <span
                  class={`col-start-1 row-start-1 flex items-center justify-center gap-2.5 transition-[opacity,transform,translate,scale] duration-300 ease-out motion-reduce:transition-none ${linkCopied ? '-translate-y-3 scale-95 opacity-0' : 'translate-y-0 scale-100 opacity-100'}`}
                >
                  <LinkIcon class="size-5 shrink-0" />
                  <span>{text.copy}</span>
                </span>
                <span
                  class={`col-start-1 row-start-1 flex items-center justify-center gap-2.5 transition-[opacity,transform,translate,scale] duration-300 ease-out motion-reduce:transition-none ${linkCopied ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'}`}
                >
                  <CheckIcon class="size-5 shrink-0" />
                  <span>{text.copied}</span>
                </span>
              </span>
            </button>
            <span class="sr-only" role="status">{linkCopied ? text.copied : ''}</span>
          </div>
        </div>

        {#if instagram}
          <div
            id="share-instagram-options"
            class="border-base-content/15 flex shrink-0 flex-col gap-3 rounded-2xl border p-4"
          >
            <p class="text-muted-foreground text-sm leading-relaxed">{text.help}</p>
            {#if shareFile}
              <button
                class={shareStyles.auxiliary}
                type="button"
                onclick={nativeImageShare}
              >
                <ShareIcon class="size-5 shrink-0" aria-hidden="true" />
                {text.shareImage}
              </button>
            {/if}
            <button
              class={shareStyles.auxiliary}
              type="button"
              onclick={() => copy(caption)}
            >
              <LinkIcon class="size-5 shrink-0" aria-hidden="true" />{text.caption}
            </button>
            <a
              class={shareStyles.auxiliary}
              href="https://www.instagram.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <InstagramIcon class="size-5 shrink-0" aria-hidden="true" />
              {text.openInstagram}
            </a>
          </div>
        {/if}
        {#if typeof navigator !== 'undefined' && typeof navigator.share === 'function'}
          <button
            class={`${shareStyles.auxiliary} shrink-0`}
            type="button"
            onclick={nativeShare}
          >
            <ShareIcon class="size-5 shrink-0" aria-hidden="true" />{text.native}
          </button>
        {/if}
      {/if}
      <p role="status" aria-live="polite" class="shrink-0 text-sm empty:hidden">
        {notice}
      </p>
    </div>
  </div>
</section>
