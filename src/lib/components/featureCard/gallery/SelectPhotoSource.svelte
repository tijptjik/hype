<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// SERVICES
import { checkCameraAvailability } from '$lib/client/services/image'
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import { Camera, FolderOpen } from '@steeze-ui/heroicons'

const imageCtx = getImageCtx()

// STATE
let hasCameraAccess = $state(false)

// ELEMENTS
let galleryInput: HTMLInputElement
// svelte-ignore non_reactive_update
let cameraInput: HTMLInputElement

$effect(() => {
  checkCameraAvailability().then(cameraAccess => {
    hasCameraAccess = cameraAccess
  })
})

// HANDLERS :: FILE INPUT
function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  const files = Array.from(input.files)
  imageCtx.handleStagedFilesSelect(files, [])

  // Reset input to allow selecting same files again
  input.value = ''
}
</script>

<!-- Hidden file inputs -->
<input
  bind:this={galleryInput}
  type="file"
  accept="image/*"
  multiple
  style="display: none"
  onchange={handleFileSelect}
>

{#if hasCameraAccess}
  <input
    bind:this={cameraInput}
    type="file"
    accept="image/*"
    capture="environment"
    style="display: none"
    onchange={handleFileSelect}
  >
{/if}

<div
  class="z-5 absolute inset-0 flex h-full w-full items-center justify-center gap-4 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0"
>
  <div class="flex h-32 w-full items-center justify-center gap-4">
    <button
      class="btn mt-4 flex h-28 w-28 flex-col border-2 border-base-100 bg-base-300 p-4 text-white"
      style="box-shadow: 0 0 10px rgba(240, 77, 127, 0.2), 0 0 20px rgba(240, 77, 127, 0.1);"
      onclick={() => galleryInput.click()}
    >
      <div class="flex flex-col items-center justify-center gap-4">
        <Icon src={FolderOpen} class="h-8 w-8" />
        {m.upload()}
      </div>
    </button>
    {#if hasCameraAccess}
      <div class="divider divider-horizontal uppercase">{m.or()}</div>
      <button
        class="btn mt-4 flex h-28 w-28 flex-col border-2 border-base-100 bg-base-300 p-4 text-white"
        style="box-shadow: 0 0 10px rgba(240, 77, 127, 0.2), 0 0 20px rgba(240, 77, 127, 0.1);"
        onclick={() => cameraInput.click()}
      >
        <div class="flex flex-col items-center justify-center gap-4">
          <Icon src={Camera} class="h-8 w-8" />
          {m.camera()}
        </div>
      </button>
    {/if}
  </div>
</div>
