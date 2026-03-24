<script lang="ts">
import type { Component } from 'svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import Camera from 'virtual:icons/lucide/camera'
import Square2Stack from 'virtual:icons/lucide/copy'
import Document from 'virtual:icons/lucide/file-text'
import AtSymbol from 'virtual:icons/lucide/at-sign'
import Calendar from 'virtual:icons/lucide/calendar'
import { formatDate } from '$lib'
import { getMetadata } from '$lib/api/server/image.remote'
// TYPES
import type { Image } from '$lib/db/zod/schema/image.types'

let { image }: { image: Image } = $props()
let metadata = $state<{
  originalFilename?: string | null
  originalExtension?: string | null
  originalWidth?: number | null
  originalHeight?: number | null
  cameraModel?: string | null
  capturedAt?: string | null
  credit?: string | null
} | null>(null)

$effect(() => {
  if (!image?.publicId) {
    metadata = null
    return
  }

  void getMetadata({
    publicId: image.publicId,
    env: image.env ?? undefined,
    profile: 'basic',
  })
    .then(response => {
      metadata = response?.data ?? null
    })
    .catch(() => {
      metadata = null
    })
})
</script>

{#snippet MetadataRow(icon: Component, label: string, value: string)}
  <div class="flex flex-wrap items-center gap-2 text-sm text-base-content/80">
    <Icon src={icon} class="h-4 w-4 grow-0" />
    <p class="font-medium">{label}:</p>
    <span>{value}</span>
  </div>
{/snippet}

<div
  class="flex min-w-50 items-center gap-3 rounded-lg bg-glass-result p-3 backdrop-blur-sm"
>
  <div class="flex flex-col gap-2">
    {#if metadata?.cameraModel}
      {@render MetadataRow(Camera, 'Camera', metadata.cameraModel)}
    {/if}
    {#if metadata?.originalWidth && metadata?.originalHeight}
      {@render MetadataRow(
        Square2Stack,
        'Dimensions',
        `${metadata.originalWidth} x ${metadata.originalHeight}`
      )}
    {/if}
    {#if metadata?.capturedAt}
      {@render MetadataRow(Calendar, 'Captured', formatDate(metadata.capturedAt))}
    {/if}
    {#if metadata?.originalFilename && metadata?.originalExtension}
      {@render MetadataRow(
        Document,
        'Filename',
        `${metadata.originalFilename}.${metadata.originalExtension}`
      )}
    {/if}
    {#if metadata?.credit}
      {@render MetadataRow(AtSymbol, 'Credit', metadata.credit)}
    {/if}
  </div>
</div>
