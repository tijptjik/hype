<script lang="ts">
import * as ImagePrimitive from './components'
import AdminViewer from './AdminViewer.svelte'
import type { CameraViewerProps } from './images.types'

let {
  items,
  activeId = $bindable<string | null>(null),
  fit = 'fit',
  uploadSelectionMode = 'multiple',
  leftRail,
  centerRail,
  rightRail,
  isEmptyUploadEnabled = true,
  onActiveIdChange,
  onUploadFiles,
  onCaptureFiles,
}: CameraViewerProps = $props()
</script>

<div class="relative h-full w-full">
  <AdminViewer
    {items}
    {activeId}
    {fit}
    {uploadSelectionMode}
    {leftRail}
    {centerRail}
    {rightRail}
    {isEmptyUploadEnabled}
    {onActiveIdChange}
    {onUploadFiles}
  />

  <div class="pointer-events-none absolute bottom-4 left-4 z-40">
    <div class="pointer-events-auto">
      <ImagePrimitive.CameraCaptureButton onFiles={onCaptureFiles ?? onUploadFiles} />
    </div>
  </div>
</div>
