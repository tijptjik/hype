<script lang="ts">
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import SvelteDropzone from 'svelte-file-dropzone'
// TYPES
import type { DropzoneEvent, ImportableResource } from '../../import.types'

type Props = {
  type: ImportableResource
  title: string
  subtitle: string
  icon: any
  accept: string[]
  disabled?: boolean
  multiple?: boolean
  isUploading?: boolean
  uploadProgress?: string
  ondrop?: (event: DropzoneEvent) => void
  onselect?: (event: DropzoneEvent) => void
}

let {
  type,
  title,
  subtitle,
  icon,
  accept,
  disabled = false,
  multiple = false,
  isUploading = false,
  uploadProgress = '',
  ondrop,
  onselect,
}: Props = $props()

function handleDrop(e: CustomEvent): void {
  ondrop?.({ ...e.detail, type })
}

function handleSelect(e: CustomEvent): void {
  onselect?.({ ...e.detail, type })
}
</script>

<SvelteDropzone
  {accept}
  {multiple}
  {disabled}
  on:drop={handleDrop}
  on:select={handleSelect}
  class="flex h-48 w-full flex-col justify-center gap-2 rounded-xl border-2 border-dashed border-primary/80 bg-glass-300/30 text-center transition-colors hover:border-primary hover:bg-base-200/50 {disabled
    ? 'cursor-not-allowed opacity-50'
    : ''}"
  disableDefaultStyles={true}
>
  <Icon src={icon} class="mx-auto h-12 w-12 text-base-content/50" />
  <div class="space-y-0">
    <p class="text-lg font-medium">{title}</p>
    {#if isUploading && uploadProgress}
      <p class="text-sm text-warning">{uploadProgress}</p>
    {:else}
      <p class="text-sm text-base-content/70">{subtitle}</p>
    {/if}
  </div>
</SvelteDropzone>
