<script lang="ts">
import * as ImagePrimitive from './components'
import Viewer from './components/Viewer.svelte'
import type { CameraViewerProps, ViewerRenderable } from './images.types'

let {
  items,
  retainedItem = null,
  activeId = $bindable<string | null>(null),
  isFullscreen = $bindable(false),
  fullscreenRequestKey = 0,
  fit = 'fit',
  viewerFit = fit,
  enableStageViewTransitions = true,
  uploadSelectionMode = 'multiple',
  wrapNavigation = true,
  showNavButtons = true,
  railPadding = 6,
  leftRail,
  centerRail,
  rightRail,
  emptyState,
  isEmptyUploadEnabled = true,
  centerAction = 'none',
  centerActionLabel,
  onCenterAction,
  onActiveIdChange,
  onNavigateToItem,
  onCurrentItemLoad,
  onUploadFiles,
  onCaptureFiles,
  onDeleteItem,
}: CameraViewerProps = $props()

let loadedActiveId = $state<string | null>(null)

const activeIndex = $derived.by(() => {
  if (!items.length) return -1
  if (!activeId) return -1
  return items.findIndex(item => item.id === activeId)
})
const resolvedActiveIndex = $derived.by(() => {
  if (!items.length) return -1
  if (activeIndex >= 0) return activeIndex
  return 0
})
const currentItem = $derived.by<ViewerRenderable | null>(() => {
  if (resolvedActiveIndex < 0) return null
  return items[resolvedActiveIndex] ?? null
})
const loadedIndex = $derived.by(() => {
  if (!loadedActiveId) return -1
  return items.findIndex(item => item.id === loadedActiveId)
})
const pendingIndex = $derived.by(() => {
  if (activeIndex < 0 || loadedIndex === activeIndex) return -1
  return activeIndex
})

$effect(() => {
  if (!activeId) {
    loadedActiveId = null
    return
  }

  if (!loadedActiveId || !items.some(item => item.id === loadedActiveId)) {
    loadedActiveId = activeId
  }
})

function handleCurrentItemLoad(item: ViewerRenderable): void {
  onCurrentItemLoad?.(item)

  if (!activeId || item.id === activeId) {
    loadedActiveId = item.id
  }
}
</script>

<div class="relative h-full w-full">
  {#if items.length === 0 && isEmptyUploadEnabled && !emptyState}
    <ImagePrimitive.CaptureOptions
      {uploadSelectionMode}
      {onUploadFiles}
      {onCaptureFiles}
    />
  {:else}
    <Viewer
      {items}
      {activeId}
      {retainedItem}
      bind:isFullscreen
      {fullscreenRequestKey}
      {fit}
      {viewerFit}
      {enableStageViewTransitions}
      {wrapNavigation}
      {showNavButtons}
      {railPadding}
      {leftRail}
      {centerRail}
      {rightRail}
      {emptyState}
      {centerAction}
      {centerActionLabel}
      {onCenterAction}
      {onActiveIdChange}
      {onNavigateToItem}
      onCurrentItemLoad={handleCurrentItemLoad}
    />

    {#if currentItem && !centerRail}
      <div
        class="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center"
      >
        <div class="pointer-events-auto">
          <ImagePrimitive.CameraViewerControls
            {uploadSelectionMode}
            {onUploadFiles}
            {onCaptureFiles}
            onDelete={() => onDeleteItem?.(currentItem)}
          />
        </div>
      </div>
    {/if}

    {#if currentItem && !rightRail}
      <div class="pointer-events-none absolute bottom-4 right-4 z-40">
        <div class="pointer-events-auto">
          <ImagePrimitive.ViewerCounter
            requestedIndex={activeIndex}
            {loadedIndex}
            {pendingIndex}
            totalCount={items.length}
          />
        </div>
      </div>
    {/if}
  {/if}
</div>
