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
  spacious?: boolean
  fill?: boolean
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
  spacious = false,
  fill = false,
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
  class={spacious
    ? `group border-base-content/25 bg-base-100/35 focus-within:border-primary/60 focus-within:bg-base-100/60 flex w-full flex-col items-center justify-center gap-5 rounded-2xl border border-dashed px-8 py-10 text-center transition-colors ${fill ? 'min-h-64 flex-1' : 'min-h-48 shrink-0'} ${disabled ? 'cursor-default' : 'hover:border-primary/60 hover:bg-base-100/60 cursor-pointer'}`
    : `border-primary/80 bg-glass-300/30 hover:border-primary hover:bg-base-200/50 flex h-48 w-full flex-col justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
  disableDefaultStyles={true}
>
  <div class={spacious ? 'bg-base-100/70 text-primary/70 rounded-2xl p-5' : ''}>
    <Icon
      src={icon}
      class={spacious ? 'h-9 w-9' : 'text-base-content/50 mx-auto h-12 w-12'}
    />
  </div>
  <div class={spacious ? 'max-w-md space-y-2' : 'space-y-0'}>
    <p class="text-lg font-medium">{title}</p>
    {#if isUploading && uploadProgress}
      <p class="text-warning text-sm">{uploadProgress}</p>
    {:else}
      <p class="text-base-content/70 text-sm">{subtitle}</p>
    {/if}
  </div>
</SvelteDropzone>
