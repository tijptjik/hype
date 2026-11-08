<script lang="ts">
// COMPONENTS
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import SvelteDropzone from 'svelte-file-dropzone'
// TYPES
import type { Component } from 'svelte'
import type { DropzoneEvent, ImportableResource } from '../../import.types'

type Props = {
  type: ImportableResource
  title: string
  subtitle: string
  icon: Component<Record<string, unknown>>
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
  <Icon src={icon} class="text-base-content/50 mx-auto h-12 w-12" />
  <div class="space-y-0">
    <p class="text-lg font-medium">{title}</p>
    {#if isUploading && uploadProgress}
      <p class="text-warning text-sm">{uploadProgress}</p>
    {:else}
      <p class="text-base-content/70 text-sm">{subtitle}</p>
    {/if}
  </div>
</SvelteDropzone>
