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
import Trash2Icon from 'virtual:icons/proicons/delete'
// LOCAL
import { detectCameraAccess, requestCameraAccess } from '../cameraAccess'

let {
  uploadSelectionMode = 'multiple',
  onUploadFiles,
  onCaptureFiles,
  onDelete,
}: {
  uploadSelectionMode?: 'single' | 'multiple'
  onUploadFiles?: (files: FileList | File[]) => void
  onCaptureFiles?: (files: FileList | File[]) => void
  onDelete?: () => void | Promise<void>
} = $props()

let galleryInput = $state<HTMLInputElement>()
let cameraInput = $state<HTMLInputElement>()
let hasCameraDevice = $state(false)
let cameraPermissionStatus = $state<'unknown' | 'prompt' | 'granted' | 'denied'>(
  'unknown',
)

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

async function handleCameraClick(): Promise<void> {
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
  class="border-border bg-base-100 text-base-content inline-flex items-center gap-2 rounded-full border px-2 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
>
  <Button
    text={m.forms__delete()}
    style="transparent"
    modifier="circle"
    hideLabel={true}
    class="border-border bg-base-100 text-base-content hover:bg-base-content/10 h-10 w-10 rounded-full border"
    onClick={() => {
      void onDelete?.()
    }}
    iconComponent={Trash2Icon}
    iconClasses="h-[18px] w-[18px]"
  />

  <div class="bg-base-content/10 h-6 w-px" aria-hidden="true"></div>

  <div
    class="text-muted-foreground px-1.5 font-mono text-[11px] tracking-[0.28em] uppercase"
  >
    {m.wacky_home_sawfish_accept()}
  </div>

  {#if hasCameraDevice}
    <Button
      text={cameraPermissionStatus === 'granted' ? m.camera() : m.camera__permission()}
      style="transparent"
      modifier="circle"
      hideLabel={true}
      class="border-border bg-base-100 text-base-content hover:bg-base-content/10 h-10 w-10 rounded-full border"
      onClick={() => {
        void handleCameraClick()
      }}
      iconComponent={CameraIcon}
      iconClasses="h-[18px] w-[18px]"
    />
  {/if}

  <Button
    text={m.upload()}
    style="transparent"
    modifier="circle"
    hideLabel={true}
    class="border-border bg-base-100 text-base-content hover:bg-base-content/10 h-10 w-10 rounded-full border"
    onClick={() => galleryInput?.click()}
    iconComponent={FolderOpenIcon}
    iconClasses="h-[18px] w-[18px]"
  />
</div>
