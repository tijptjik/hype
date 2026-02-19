<script lang="ts">
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import { FolderOpen } from '@steeze-ui/heroicons'

// CONTEXT
const imageCtx = getImageCtx()

// ELEMENTS
let galleryInput: HTMLInputElement

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

<!-- Hidden file input -->
<input
  bind:this={galleryInput}
  type="file"
  accept="image/*"
  multiple
  style="display: none"
  onchange={handleFileSelect}
>

<div
  class="flex h-10 w-10 cursor-pointer select-none flex-row items-center justify-center gap-2 overflow-visible rounded-full bg-black/50 px-2 py-1 font-mono text-xs text-white caret-transparent"
  onclick={() => galleryInput.click()}
>
  <Icon src={FolderOpen} class="h-5 w-5" />
</div>
