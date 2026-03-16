<script lang="ts">
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte'
// BITS
import { UserAttributionCard } from '$lib/bits'
// COMPONENTS
import PhotoFrame from '$lib/components/common/PhotoFrame.svelte'
import Icon from '$lib/components/common/Icon.svelte'
import Camera from 'virtual:icons/lucide/camera'
import Photo from 'virtual:icons/lucide/image'
import InformationCircle from 'virtual:icons/lucide/info'
import Dropzone from 'svelte-file-dropzone'
import Metadata from '$lib/components/common/ImageMetadata.svelte'
import DownloadImageButton from '$lib/components/images/DownloadImageButton.svelte'
import IconAnchor from '$lib/components/common/IconAnchor.svelte'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// TYPES
import type { Snippet } from 'svelte'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

type Props = {
  LeftActions?: Snippet
  MiddleActions?: Snippet
  RightActions?: Snippet
  onActiveImageChange?: (image: ImageCtxEnvelope | null) => void
  isDropzone?: boolean
  enableReplacement?: boolean
  hideActions?: boolean
  tightActions?: boolean
  layout?: 'cover' | 'contain'
}

// STATE : PROPS
let {
  LeftActions,
  MiddleActions,
  RightActions,
  onActiveImageChange,
  isDropzone = false,
  hideActions = false,
  tightActions = false,
  layout = 'contain',
}: Props = $props()

// STATE : CONTEXT :: ROUTER
const imageCtx = getImageCtx()
const adminCtx = getAdminCtx()

let image = $derived(imageCtx.activeImage)
let viewerState = $derived(imageCtx.viewerState)
let isError = $derived(viewerState === 'error')
let hasActiveImage = $derived(Boolean(image?.image.id))
let imageCount = $derived(imageCtx.getImages().length)
let isPendingEmptyResolution = $derived(
  viewerState === 'empty' && !hasActiveImage && imageCount === 0,
)
let isResolvedEmpty = $state(false)
let emptyStateTimer: ReturnType<typeof setTimeout> | null = null
let isEmpty = $derived(isPendingEmptyResolution && isResolvedEmpty)
let showResolvingLoader = $derived(!hasActiveImage && !isError && !isEmpty)
let isDropzoneDisabled = $derived(showResolvingLoader)

// HANDLERS :: FILE DROP
const handleDrop = async (e: CustomEvent) => {
  if (!isDropzone) return
  if (isDropzoneDisabled) return
  imageCtx.handleFilesSelect(
    e.detail.acceptedFiles,
    e.detail.fileRejections,
    {
      onSuccess: () => {
        if (adminCtx.activeResourceType) {
          adminCtx.invalidateAndRefresh(adminCtx.activeResourceType)
        }
      },
      onError: () => {
        console.error('[Viewer] Upload error')
      },
    },
    imageCtx.activeImage ?? undefined,
  )
}

$effect(() => {
  if (emptyStateTimer) {
    clearTimeout(emptyStateTimer)
    emptyStateTimer = null
  }

  if (!isPendingEmptyResolution) {
    isResolvedEmpty = false
    return
  }

  emptyStateTimer = setTimeout(() => {
    if (
      imageCtx.viewerState === 'empty' &&
      !imageCtx.activeImage &&
      imageCtx.getImages().length === 0
    ) {
      isResolvedEmpty = true
    }
    emptyStateTimer = null
  }, 900)
})

$effect(() => {
  return () => {
    if (emptyStateTimer) {
      clearTimeout(emptyStateTimer)
      emptyStateTimer = null
    }
  }
})

$effect(() => {
  onActiveImageChange?.(image ?? null)
})
</script>

{#snippet EmptyContent()}
  {#if isDropzone}
    <div class="flex h-full flex-col items-center justify-center">
      <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
      <span class="mx-auto pb-6 text-sm">{m.born_plain_bulldog_stop()}</span>
    </div>
  {:else}
    <div class="flex h-full flex-col items-center justify-center">
      <h1 class="text-2xl font-bold uppercase text-base-content/60">
        {m.viewer__no_image()}
      </h1>
      <h1 class="pt-2 text-lg text-neutral-content/60">
        {imageCtx.isFullscreen ? m.viewer__tap_to_leave_fullscreen() : ''}
      </h1>
    </div>
  {/if}
{/snippet}

{#snippet LoadingContent()}
  <div class="flex h-full flex-col items-center justify-center">
    <div class="viewer-resolve-loader" aria-label="Loading image" role="status"></div>
  </div>
{/snippet}

{#snippet ErrorContent()}
  <div class="flex h-full flex-col items-center justify-center gap-2 text-error">
    <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
    <span class="mx-auto pb-6 text-sm">{m.stale_quick_fireant_enchant()}</span>
  </div>
{/snippet}

{#snippet PhotoFrameWithActions()}
  {#if showResolvingLoader}
    {@render LoadingContent()}
  {:else if isEmpty}
    {@render EmptyContent()}
  {:else if isError}
    {@render ErrorContent()}
  {:else}
    <PhotoFrame
      class="h-full w-full overflow-hidden rounded-2xl"
      mode="standalone"
      showLoading={false}
      {layout}
    >
      {#snippet children()}
        {#if image && !hideActions}
          <!-- Left Actions -->
          <div
            class="absolute bottom-0 left-0 z-30 flex flex-row items-start gap-4 overflow-visible {tightActions
              ? 'm-2'
              : 'm-10'}"
          >
            {#if LeftActions}
              {@render LeftActions()}
            {:else}
              <IconAnchor position="left" icon={Camera}>
                <Metadata image={image.image} />
              </IconAnchor>
            {/if}
          </div>

          <!-- Middle Actions -->
          {#if MiddleActions}
            <div
              class="absolute bottom-0 left-0 right-0 z-30 mx-auto flex flex-row items-center gap-4 overflow-visible {tightActions
                ? 'm-2'
                : 'm-10'}"
            >
              {@render MiddleActions()}
            </div>
          {/if}

          <!-- Right Actions -->
          <div
            class="absolute bottom-0 right-0 z-30 flex flex-row items-end gap-4 overflow-visible {tightActions
              ? 'm-2'
              : 'm-10'}"
          >
            {#if RightActions}
              {@render RightActions()}
            {:else}
              <IconAnchor position="right" icon={InformationCircle} class="mr-4">
                <UserAttributionCard
                  userId={image.image.contributorId}
                  date={image.image.createdAt || undefined}
                  type="imageContributor"
                />
              </IconAnchor>
              <DownloadImageButton {image} />
            {/if}
          </div>
        {/if}
      {/snippet}
    </PhotoFrame>
  {/if}
{/snippet}

<div
  class="relative flex min-h-0 w-full flex-1 flex-col rounded-2xl {isDropzone
    ? 'group'
    : ''}"
  style="transition: outline-color 150ms ease-out"
  in:fade={{ duration: 300, delay: 50 }}
>
  {#if isDropzone}
    <Dropzone
      accept={['image/*']}
      on:drop={handleDrop}
      on:select={handleDrop}
      multiple={false}
      disabled={isDropzoneDisabled}
      class="group flex h-full w-full flex-col justify-center gap-2 rounded-xl bg-neutral text-center align-middle transition-colors"
      disableDefaultStyles={true}
    >
      <div
        class="border-offset-2 pointer-events-none absolute inset-0 z-50 m-4 rounded-xl border-4 border-dashed border-transparent transition-colors delay-500 {!isDropzoneDisabled
          ? 'group-hover:border-primary'
          : ''}"
      ></div>
      {@render PhotoFrameWithActions()}
    </Dropzone>
  {:else}
    {@render PhotoFrameWithActions()}
  {/if}
</div>

<style>
.viewer-resolve-loader {
  display: inline-flex;
  gap: 5px;
  opacity: 0.5;
}

.viewer-resolve-loader::before,
.viewer-resolve-loader::after {
  content: "";
  width: 25px;
  aspect-ratio: 1;
  box-shadow: 0 0 0 3px inset #fff;
  animation: viewer-resolve-loader-frames 1.5s infinite;
}

.viewer-resolve-loader::after {
  --s: -1;
}

@keyframes viewer-resolve-loader-frames {
  0% {
    transform: scaleX(var(--s, 1)) translate(0) scale(1);
  }
  33% {
    transform: scaleX(var(--s, 1)) translate(calc(50% + 2.5px)) scale(1);
  }
  66% {
    transform: scaleX(var(--s, 1)) translate(calc(50% + 2.5px)) scale(2);
  }
  100% {
    transform: scaleX(var(--s, 1)) translate(0) scale(1);
  }
}
</style>
