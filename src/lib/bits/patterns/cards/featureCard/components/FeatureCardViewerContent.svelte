<script lang="ts">
import { useImageEditorGalleryModel } from '$lib/adapters/image'
import { getURLfromImage } from '$lib/client/services/image'
import { CameraViewer } from '$lib/bits/patterns/images'
import Viewer from '$lib/bits/patterns/images/components/Viewer.svelte'
import { getCardCtx } from '$lib/context/card.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
import * as ViewerPrimitive from './images'
import type { ViewerRenderable } from '$lib/bits/patterns/images'

const cardCtx = getCardCtx()
const imageCtx = getImageCtx()
const model = useImageEditorGalleryModel(imageCtx)
let loadedActiveId = $state<string | null>(null)
let lockedViewerHeight = $state<number | null>(null)
let viewerRoot: HTMLDivElement | null = null

let {
  scrollable = false,
  minHeightPx = 320,
  paddingPx = 0,
  topPaddingPx = 0,
  targetHeightPx = null,
}: {
  scrollable?: boolean
  minHeightPx?: number
  paddingPx?: number
  topPaddingPx?: number
  targetHeightPx?: number | null
} = $props()

const viewerBlockMinHeightPx = $derived(minHeightPx + topPaddingPx + paddingPx)
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

{#snippet emptyState()}
  <ViewerPrimitive.EmptyState />
{/snippet}

<div
  bind:this={viewerRoot}
  class={`pointer-events-auto w-full select-none bg-black/95 px-(--feature-card-viewer-padding,0px) pb-(--feature-card-viewer-padding,0px) pt-(--feature-card-viewer-padding-top,0px) transition-[height,min-height,max-height,flex-basis] duration-[240ms] ease-out motion-reduce:transition-none [touch-action:manipulation] ${scrollable ? 'shrink-0 grow-0 basis-auto' : 'flex-[1_1_auto]'}`}
  style={`${viewerStyle ?? ''}${viewerStyle ? ' ' : ''}min-height: ${viewerBlockMinHeightPx}px;`}
  onclick={stopViewerEvent}
  onpointerdown={stopViewerEvent}
  onpointermove={stopViewerEvent}
  onpointerup={stopViewerEvent}
  ontouchstart={stopViewerEvent}
  ontouchmove={stopViewerEvent}
  ontouchend={stopViewerEvent}
>
  {#if isContributionMode}
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
      {rightRail}
      {emptyState}
      onActiveIdChange={model.actions.select}
      onCurrentItemLoad={handleCurrentItemLoad}
    />
  {/if}
</div>
