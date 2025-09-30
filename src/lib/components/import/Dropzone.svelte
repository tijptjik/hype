<script lang="ts">
// SVELTE
import { createEventDispatcher } from 'svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import SvelteDropzone from 'svelte-file-dropzone';

// TYPES
type DropzoneType = 'features' | 'users' | 'events' | 'images';

type Props = {
  type: DropzoneType;
  title: string;
  subtitle: string;
  icon: any;
  accept: string[];
  disabled?: boolean;
  multiple?: boolean;
  isUploading?: boolean;
  uploadProgress?: string;
};

let {
  type,
  title,
  subtitle,
  icon,
  accept,
  disabled = false,
  multiple = false,
  isUploading = false,
  uploadProgress = ''
}: Props = $props();

const dispatch = createEventDispatcher();

function handleDrop(e: CustomEvent) {
  dispatch('drop', { ...e.detail, type });
}

function handleSelect(e: CustomEvent) {
  dispatch('select', { ...e.detail, type });
}
</script>

<SvelteDropzone
  {accept}
  {multiple}
  {disabled}
  on:drop={handleDrop}
  on:select={handleSelect}
  class="flex h-48 w-full flex-col justify-center gap-4 rounded-xl border-2 border-dashed border-base-content/20 bg-glass-300/30 text-center transition-colors hover:border-primary hover:bg-base-200/50 {disabled
    ? 'cursor-not-allowed opacity-50'
    : ''}"
  disableDefaultStyles={true}>
  <Icon src={icon} class="mx-auto h-12 w-12 text-base-content/50" />
  <div class="space-y-2">
    <p class="text-lg font-medium">{title}</p>
    {#if isUploading && uploadProgress}
      <p class="text-sm text-warning">{uploadProgress}</p>
    {:else}
      <p class="text-sm text-base-content/70">{subtitle}</p>
    {/if}
  </div>
</SvelteDropzone>
