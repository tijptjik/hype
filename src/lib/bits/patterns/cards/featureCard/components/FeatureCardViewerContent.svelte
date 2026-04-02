<script lang="ts">
import { useImageEditorGalleryModel } from '$lib/adapters/image'
import Viewer from '$lib/bits/patterns/images/components/Viewer.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
import * as ViewerPrimitive from './images'
import type { ViewerRenderable } from '$lib/bits/patterns/images'

const imageCtx = getImageCtx()
const model = useImageEditorGalleryModel(imageCtx)
const FEATURE_CARD_VIEWER_MIN_HEIGHT_PX = 300

let loadedActiveId = $state<string | null>(null)
let lockedViewerHeight = $state<number | null>(null)
let viewerRoot: HTMLDivElement | null = null

const activeIndex = $derived.by(() => {
  const activeId = model.state.activeId

  if (!activeId) return -1
  return model.state.items.findIndex(item => item.id === activeId)
})
const loadedIndex = $derived.by(() => {
  if (!loadedActiveId) return activeIndex

  return model.state.items.findIndex(item => item.id === loadedActiveId)
})
const currentImage = $derived(model.state.activeImage)
const shouldShowMetadata = $derived(
  Boolean(currentImage && !imageCtx.isImageStaged(currentImage)),
)

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
    const measuredHeight = viewerRoot?.offsetHeight ?? 0

    if (measuredHeight <= 0) return

    lockedViewerHeight = Math.max(measuredHeight, FEATURE_CARD_VIEWER_MIN_HEIGHT_PX)
  })
}

function stopViewerEvent(event: Event): void {
  event.stopPropagation()
}
</script>

{#snippet leftRail(_item: ViewerRenderable)}
  {#if currentImage && shouldShowMetadata}
    <ViewerPrimitive.Metadata {currentImage} />
  {/if}
{/snippet}

{#snippet rightRail(_item: ViewerRenderable)}
  <ViewerPrimitive.Counter
    currentIndex={activeIndex}
    {loadedIndex}
    totalCount={model.state.items.length}
  />
{/snippet}

{#snippet emptyState()}
  <ViewerPrimitive.EmptyState />
{/snippet}

<div
  bind:this={viewerRoot}
  class="pointer-events-auto min-h-300 w-full flex-[1_1_auto] select-none bg-black/95 px-(--feature-card-viewer-padding,0px) pb-(--feature-card-viewer-padding,0px) pt-0 [touch-action:manipulation]"
  style={lockedViewerHeight ? `flex-basis: ${lockedViewerHeight}px;` : undefined}
  onclick={stopViewerEvent}
  onpointerdown={stopViewerEvent}
  onpointermove={stopViewerEvent}
  onpointerup={stopViewerEvent}
  ontouchstart={stopViewerEvent}
  ontouchmove={stopViewerEvent}
  ontouchend={stopViewerEvent}
>
  <Viewer
    items={model.state.items}
    activeId={model.state.activeId}
    viewerFit={model.state.presentationMode === 'cover' ? 'cover' : 'fit'}
    wrapNavigation={true}
    showNavButtons={false}
    railPadding={3}
    centerAction="fullscreen"
    {leftRail}
    {rightRail}
    {emptyState}
    onActiveIdChange={model.actions.select}
    onCurrentItemLoad={handleCurrentItemLoad}
  />
</div>
