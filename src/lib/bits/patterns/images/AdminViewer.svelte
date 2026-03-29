<script lang="ts">
import * as ImagePrimitive from './components'
import Viewer from './components/Viewer.svelte'
import type { AdminViewerProps } from './images.types'

let {
  items,
  activeId = $bindable<string | null>(null),
  isFullscreen = $bindable(false),
  fullscreenRequestKey = 0,
  fit = 'fit',
  viewerFit = fit,
  leftRail,
  centerRail,
  rightRail,
  centerAction = 'none',
  centerActionLabel,
  isEmptyUploadEnabled = true,
  isEmptyDropzoneEnabled = true,
  isEmptyUploadDisabled = false,
  uploadSelectionMode = 'multiple',
  onCenterAction,
  onActiveIdChange,
  onNavigateToItem,
  onCurrentItemLoad,
  onUploadFiles,
}: AdminViewerProps = $props()
</script>

<div class="relative h-full w-full">
  {#if isEmptyUploadEnabled && items.length === 0}
    <ImagePrimitive.Dropzone
      disabled={isEmptyUploadDisabled || !isEmptyDropzoneEnabled}
      hasItems={false}
      showPrompt={false}
      showEmptyState={true}
      {uploadSelectionMode}
      onFiles={files => onUploadFiles?.(files)}
    />
  {:else}
    <Viewer
      {items}
      {activeId}
      bind:isFullscreen
      {fullscreenRequestKey}
      {fit}
      {viewerFit}
      {leftRail}
      {centerRail}
      {rightRail}
      {centerAction}
      {centerActionLabel}
      {onCenterAction}
      {onActiveIdChange}
      {onNavigateToItem}
      {onCurrentItemLoad}
    />
  {/if}
</div>
