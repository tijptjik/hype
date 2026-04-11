<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// I18N
import { m } from '$lib/i18n'
// BITS COMPONENTS
import { Button } from '$lib/bits/core/button'
// LIB
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE } from '$lib/images/accept'
// ICONS
import CameraIcon from 'virtual:icons/lucide/camera'
import FolderOpenIcon from 'virtual:icons/lucide/folder-open'
// LOCAL
import { detectCameraAccess, requestCameraAccess } from './cameraAccess'

let {
  uploadSelectionMode = 'multiple',
  onUploadFiles,
  onCaptureFiles,
}: {
  uploadSelectionMode?: 'single' | 'multiple'
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
  class="flex h-full w-full flex-col items-center justify-center gap-5 rounded-[1.75rem] border border-dashed border-white/15 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),rgba(0,0,0,0.04)_48%),linear-gradient(180deg,rgba(16,17,20,0.84),rgba(8,9,11,0.94))] px-6 py-8 text-center text-white"
>
  <div class="space-y-2">
    <p class="font-mono text-[11px] uppercase tracking-[0.32em] text-white/55">
      {m.wacky_home_sawfish_accept()}
    </p>
    <h3 class="text-2xl font-semibold tracking-[-0.03em] text-white">
      {m.honest_fluffy_falcon_enjoy()}
    </h3>
    <p class="max-w-[24rem] text-sm leading-6 text-white/68">
      {cameraHelperText ?? m.viewer__no_image_note()}
    </p>
  </div>

  <div class="flex flex-wrap items-center justify-center gap-3">
    <Button
      text={m.upload()}
      color="dark"
      style="soft"
      size="md"
      iconComponent={FolderOpenIcon}
      iconClasses="h-4.5 w-4.5"
      class="rounded-full bg-white/10 text-white shadow-none hover:bg-white/16 hover:text-white"
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
        class="rounded-full bg-black/60 text-white shadow-none hover:bg-black/75 hover:text-white"
        onClick={() => {
          void openCameraCapture()
        }}
      />
    {/if}
  </div>
</div>
