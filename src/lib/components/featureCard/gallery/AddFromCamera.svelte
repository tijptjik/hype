<script lang="ts">
/**
 * @component Displays image metadata including attribution and intent
 * @param {Image} currentImage - The currently displayed image
 */
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Camera } from '@steeze-ui/heroicons';
// TYPES
import type { Image } from '$lib/types';

// PROPS
let { currentImage }: { currentImage: Image } = $props();

// CONTEXT
const imageCtx = getImageCtx();

// ELEMENTS
let cameraInput: HTMLInputElement;

// HANDLERS :: FILE INPUT
function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  const files = Array.from(input.files);
  imageCtx.handleStagedFilesSelect(files, []);

  // Reset input to allow selecting same files again
  input.value = '';
}
</script>

<!-- Hidden file input -->
<input
  bind:this={cameraInput}
  type="file"
  accept="image/*"
  capture="environment"
  style="display: none"
  onchange={handleFileSelect} />

<div
  class="flex h-10 w-10 cursor-pointer select-none flex-row items-center justify-center gap-2 overflow-visible rounded-full bg-black/50 px-2 py-1 font-mono text-xs text-white caret-transparent"
  onclick={() => cameraInput.click()}>
  <Icon src={Camera} class="h-5 w-5" />
</div>
