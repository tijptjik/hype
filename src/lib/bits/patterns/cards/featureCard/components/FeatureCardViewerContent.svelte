<script lang="ts">
import { useImageEditorGalleryModel } from '#lib/adapters/image/index.js'
import { getURLfromImage } from '#lib/client/services/image.js'
import { CameraViewer } from '#lib/bits/patterns/images/index.js'
import FeatureCardShare from './FeatureCardShare.svelte'
import Viewer from '#lib/bits/patterns/images/components/Viewer.svelte'
import {
  VIEWER_TRANSITION_MS,
  VIEWER_TRANSITION_EASING,
} from '#lib/bits/patterns/images/images.motion.js'
import { getCardCtx } from '#lib/context/card.svelte.js'
import { getImageCtx } from '#lib/context/image.svelte.js'
import * as ViewerPrimitive from './images'
import type { ViewerRenderable } from '#lib/bits/patterns/images/index.js'

const cardCtx = getCardCtx()
const imageCtx = getImageCtx()
const model = useImageEditorGalleryModel(imageCtx)
let loadedActiveId = $state<string | null>(null)
let lockedViewerHeight = $state<number | null>(null)
let viewerRoot = $state<HTMLDivElement | null>(null)

let {
  showImagePips = false,
  scrollable = false,
  minHeightPx = 320,
  paddingPx = 0,
  topPaddingPx = 0,
  targetHeightPx = null,
  onOverlayHeightChange,
}: {
  showImagePips?: boolean
  scrollable?: boolean
  minHeightPx?: number
  paddingPx?: number
  topPaddingPx?: number
  targetHeightPx?: number | null
  onOverlayHeightChange?: (height: number) => void
} = $props()

let shareContentHeight = $state(0)
let attributionContentHeight = $state(0)
const overlayContentHeight = $derived(
  Math.max(shareContentHeight, attributionContentHeight),
)
$effect(() => onOverlayHeightChange?.(overlayContentHeight))
const viewerBlockMinHeightPx = $derived(
  Math.max(minHeightPx, overlayContentHeight) + topPaddingPx + paddingPx,
)
const isContributionMode = $derived(
  cardCtx.isMissingMode || cardCtx.isAddPhotoMode || cardCtx.isNewMode,
)
const stagedItems = $derived.by<ViewerRenderable[]>(() =>
  imageCtx.getStagedImages().map(image => ({
    id: image.image.id,
    src: getURLfromImage({ image }),
    alt: null,
    meta: {
      imageId: image.image.id,
    },
  })),
)
const stagedActiveId = $derived.by(() => {
  const activeImageId = imageCtx.state.activeImage?.image.id ?? null

  if (activeImageId && stagedItems.some(item => item.id === activeImageId)) {
    return activeImageId
  }

  return stagedItems[stagedItems.length - 1]?.id ?? null
})

const activeIndex = $derived.by(() => {
  const activeId = model.state.activeId

  if (!activeId) return -1
  return model.state.items.findIndex(item => item.id === activeId)
})
const loadedIndex = $derived.by(() => {
  if (!loadedActiveId) return -1

  return model.state.items.findIndex(item => item.id === loadedActiveId)
})
const pendingIndex = $derived.by(() => {
  if (activeIndex < 0 || loadedIndex === activeIndex) return -1
  return activeIndex
})

$effect(() => {
  const activeId = model.state.activeId

  if (!activeId) {
    loadedActiveId = null
    return
  }

  if (!loadedActiveId || !model.state.items.some(item => item.id === loadedActiveId)) {
    loadedActiveId = activeId
  }
})

function handleCurrentItemLoad(item: ViewerRenderable): void {
  model.actions.markCurrentItemLoaded(item)

  if (item.id !== model.state.activeId) return

  loadedActiveId = item.id

  if (lockedViewerHeight !== null) return

  requestAnimationFrame(() => {
    const measuredHeight = viewerRoot
      ? Math.ceil(viewerRoot.getBoundingClientRect().height)
      : 0

    if (measuredHeight <= 0) return

    lockedViewerHeight = Math.max(measuredHeight, viewerBlockMinHeightPx)
  })
}

function stopViewerEvent(event: Event): void {
  event.stopPropagation()
}

// Once the body is measured, move it with the gallery using the feature crossfade
// timing. The container fills spare space while the retained geometry transitions.
// Attribution animates its measured content; follow directly without a second easing.
const viewerStyle = $derived.by(() => {
  if (targetHeightPx) {
    const resolvedHeight = Math.max(targetHeightPx, viewerBlockMinHeightPx)
    return [
      `height: ${resolvedHeight}px;`,
      `min-height: ${resolvedHeight}px;`,
      `max-height: ${resolvedHeight}px;`,
      `flex-basis: ${resolvedHeight}px;`,
    ].join(' ')
  }

  if (scrollable) {
    return [
      `height: ${viewerBlockMinHeightPx}px;`,
      `min-height: ${viewerBlockMinHeightPx}px;`,
      `max-height: ${viewerBlockMinHeightPx}px;`,
      `flex-basis: ${viewerBlockMinHeightPx}px;`,
    ].join(' ')
  }

  if (lockedViewerHeight) {
    const resolvedHeight = Math.max(
      targetHeightPx ?? lockedViewerHeight,
      viewerBlockMinHeightPx,
    )
    return `flex-basis: ${resolvedHeight}px; min-height: ${resolvedHeight}px;`
  }

  return undefined
})
</script>

{#snippet rightRail(_item: ViewerRenderable)}
  <ViewerPrimitive.Counter
    requestedIndex={activeIndex}
    {loadedIndex}
    {pendingIndex}
    totalCount={model.state.items.length}
  />
{/snippet}

{#snippet leftRail()}
  {#if model.state.activeImage}
    {#key `${model.state.activeImage.ctxId}:${model.state.activeImage.image.id}`}
      <ViewerPrimitive.Metadata
        currentImage={model.state.activeImage}
        gallery={model}
        overlayTarget={viewerRoot}
        onHeightChange={height => {
          attributionContentHeight = height
        }}
      />
    {/key}
  {/if}
{/snippet}

{#snippet emptyState()}
  <ViewerPrimitive.EmptyState />
{/snippet}

<!-- biome-ignore lint/a11y/noStaticElementInteractions: The viewer shell stops bubbling pointer events from activating the enclosing card. -->
<div
  bind:this={viewerRoot}
  data-feature-card-gallery
  class={`bg-base-200 pointer-events-auto relative w-full [touch-action:manipulation] px-(--feature-card-viewer-padding,0px) pt-(--feature-card-viewer-padding-top,0px) pb-(--feature-card-viewer-padding,0px) transition-[height,min-height,max-height,flex-basis] select-none motion-reduce:transition-none ${scrollable ? 'shrink-0 grow-0 basis-auto' : 'flex-[1_1_auto]'}`}
  style={`transition-duration: ${attributionContentHeight > 0 ? 0 : VIEWER_TRANSITION_MS}ms; transition-timing-function: ${VIEWER_TRANSITION_EASING}; ${viewerStyle ?? ''}${viewerStyle ? ' ' : ''}min-height: ${viewerBlockMinHeightPx}px;`}
  onclick={stopViewerEvent}
  onkeydown={stopViewerEvent}
  onpointerdown={stopViewerEvent}
  onpointermove={stopViewerEvent}
  onpointerup={stopViewerEvent}
  ontouchstart={stopViewerEvent}
  ontouchmove={stopViewerEvent}
  ontouchend={stopViewerEvent}
>
  {#if cardCtx.shareTarget}
    <FeatureCardShare
      target={cardCtx.shareTarget}
      onHeightChange={height => {
        shareContentHeight = height
      }}
      onClose={() => {
        cardCtx.shareTarget = null
        document.querySelector<HTMLButtonElement>('#feature-share-trigger')?.focus()
      }}
    />
  {:else if isContributionMode}
    <CameraViewer
      items={stagedItems}
      activeId={stagedActiveId}
      fit="fit"
      viewerFit="fit"
      enableStageViewTransitions={false}
      wrapNavigation={true}
      showNavButtons={false}
      railPadding={3}
      emptyDescription={null}
      onActiveIdChange={id => {
        imageCtx.targetItem(id)
      }}
      onUploadFiles={files => {
        void imageCtx.handleStagedFilesSelect(Array.from(files), [])
      }}
      onCaptureFiles={files => {
        void imageCtx.handleStagedFilesSelect(Array.from(files), [])
      }}
      onDeleteItem={item => {
        imageCtx.unstageImage(item.id)
      }}
    />
  {:else}
    <Viewer
      items={model.state.items}
      activeId={model.state.activeId}
      viewerFit={model.state.presentationMode === 'cover' ? 'cover' : 'fit'}
      enableStageViewTransitions={false}
      wrapNavigation={true}
      showNavButtons={false}
      railPadding={3}
      centerAction="fullscreen"
      {leftRail}
      rightRail={showImagePips ? undefined : rightRail}
      {emptyState}
      onActiveIdChange={model.actions.select}
      onCurrentItemLoad={handleCurrentItemLoad}
    />
    {#if showImagePips && model.state.items.length > 1}
      <!-- Keep the compact card's image count clear of the raised portal. -->
      <div
        class="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center"
        data-feature-card-image-pips
      >
        <div
          class="flex max-w-full flex-wrap justify-center gap-1.5 rounded-xl bg-black/40 px-2 py-1.5 backdrop-blur-sm"
        >
          <span class="sr-only" aria-live="polite"
            >{Math.max(loadedIndex, 0) + 1}
            / {model.state.items.length}</span
          >
          {#each model.state.items as item, index (item.id)}
            <span
              aria-hidden="true"
              class={`size-1.5 shrink-0 rounded-full transition-opacity motion-reduce:transition-none ${index === loadedIndex ? 'bg-white' : 'bg-white/35'} ${index === pendingIndex ? 'animate-pulse motion-reduce:animate-none' : ''}`}
            ></span>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
