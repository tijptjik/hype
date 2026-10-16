<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/button/index.js'
// LIB
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE } from '#lib/images/accept.js'
// ICONS
import CameraIcon from 'virtual:icons/proicons/camera'
import FolderOpenIcon from 'virtual:icons/proicons/folder-open'
import ImageIcon from 'virtual:icons/proicons/photo'
// LOCAL
import { detectCameraAccess, requestCameraAccess } from './cameraAccess'

let {
  uploadSelectionMode = 'multiple',
  emptyDescription = m.viewer__no_image_note(),
  onUploadFiles,
  onCaptureFiles,
}: {
  uploadSelectionMode?: 'single' | 'multiple'
  emptyDescription?: string | null
  onUploadFiles?: (files: FileList | File[]) => void
  onCaptureFiles?: (files: FileList | File[]) => void
} = $props()

let galleryInput = $state<HTMLInputElement>()
let cameraInput = $state<HTMLInputElement>()
let hasCameraDevice = $state(false)
let cameraPermissionStatus = $state<'unknown' | 'prompt' | 'granted' | 'denied'>(
  'unknown',
)

const shouldShowCameraAction = $derived(hasCameraDevice)
const cameraHelperText = $derived.by(() => {
  if (!hasCameraDevice) return null
  if (cameraPermissionStatus === 'denied') {
    return m.camera__access_denied_note()
  }
  if (cameraPermissionStatus === 'prompt' || cameraPermissionStatus === 'unknown') {
    return m.camera__permission_note()
  }
  return null
})

function handleUploadChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement

  if (!input.files?.length) return

  onUploadFiles?.(input.files)
  input.value = ''
}

function handleCaptureChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement

  if (!input.files?.length) return

  ;(onCaptureFiles ?? onUploadFiles)?.(input.files)
  input.value = ''
}

async function openCameraCapture(): Promise<void> {
  if (!hasCameraDevice) return

  if (cameraPermissionStatus !== 'granted') {
    cameraPermissionStatus = await requestCameraAccess()
  }

  if (cameraPermissionStatus === 'granted') {
    cameraInput?.click()
  }
}

onMount(() => {
  void (async () => {
    const access = await detectCameraAccess()
    hasCameraDevice = access.hasCameraDevice
    cameraPermissionStatus = access.permissionStatus
  })()
})
</script>

<input
  bind:this={galleryInput}
  type="file"
  accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE}
  multiple={uploadSelectionMode === 'multiple'}
  class="sr-only"
  onchange={handleUploadChange}
>

<input
  bind:this={cameraInput}
  type="file"
  accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE}
  capture="environment"
  class="sr-only"
  onchange={handleCaptureChange}
>

<div
  class="flex h-full w-full flex-col items-center justify-center gap-5 rounded-[1.75rem] border border-dashed border-border bg-surface px-6 py-8 text-center text-base-content"
>
  <div class="space-y-2">
    <div class="flex justify-center">
      <ImageIcon class="h-6 w-6 text-muted-foreground" />
    </div>
    <h3 class="text-2xl font-semibold tracking-[-0.03em] text-base-content pb-2">
      {m.honest_fluffy_falcon_enjoy()}
    </h3>
    {#if cameraHelperText ?? emptyDescription}
      <p class="max-w-[24rem] text-sm leading-6 text-muted-foreground">
        {cameraHelperText ?? emptyDescription}
      </p>
    {/if}
  </div>

  <div class="flex flex-wrap items-center justify-center gap-3">
    <Button
      text={m.upload()}
      color="dark"
      style="soft"
      size="md"
      iconComponent={FolderOpenIcon}
      iconClasses="h-4.5 w-4.5"
      class="rounded-full bg-base-content/10 text-base-content shadow-none hover:bg-base-content/10 hover:text-base-content"
      onClick={() => galleryInput?.click()}
    />

    {#if shouldShowCameraAction}
      <Button
        text={cameraPermissionStatus === 'granted'
          ? m.camera()
          : m.camera__permission()}
        color="dark"
        style="soft"
        size="md"
        iconComponent={CameraIcon}
        iconClasses="h-4.5 w-4.5"
        class="rounded-full bg-base-100 text-base-content shadow-none hover:bg-surface hover:text-base-content"
        onClick={() => {
          void openCameraCapture()
        }}
      />
    {/if}
  </div>
</div>
