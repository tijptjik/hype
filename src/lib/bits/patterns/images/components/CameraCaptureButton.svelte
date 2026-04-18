<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core/button'
// LIB
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE } from '$lib/images/accept'
// I18n
import { m } from '$lib/i18n'
// ICONS
import CameraIcon from 'virtual:icons/lucide/camera'

let {
  onFiles,
}: {
  onFiles?: (files: FileList | File[]) => void
} = $props()

let inputEl = $state<HTMLInputElement>()

function handleChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement
  if (!input.files?.length) return
  onFiles?.(input.files)
  input.value = ''
}
</script>

<input
  bind:this={inputEl}
  type="file"
  accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE}
  capture="environment"
  class="sr-only"
  onchange={handleChange}
>

<Button
  text={m.camera()}
  color="dark"
  style="soft"
  size="sm"
  iconComponent={CameraIcon}
  iconClasses="h-4 w-4"
  class="rounded-full bg-black/60 text-white shadow-none hover:bg-black/75 hover:text-white"
  onClick={() => inputEl?.click()}
/>
