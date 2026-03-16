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
// TYPES
import type { Image, ImageUploadCtx as Refs } from '$lib/db/zod/schema/image.types'

let { image }: { image: Image } = $props()
</script>

{#snippet MetadataRow(icon: Component, label: string, value: string)}
  <div class="flex flex-wrap items-center gap-2 text-sm text-base-content/80">
    <Icon src={icon} class="h-4 w-4 flex-grow-0" />
    <p class="font-medium">{label}:</p>
    <span>{value}</span>
  </div>
{/snippet}

<div
  class="flex min-w-[200px] items-center gap-3 rounded-lg bg-glass-result p-3 backdrop-blur-sm"
>
  <div class="flex flex-col gap-2">
    {#if image.cameraModel}
      {@render MetadataRow(Camera, 'Camera', image.cameraModel)}
    {/if}
    {#if image.originalWidth && image.originalHeight}
      {@render MetadataRow(
        Square2Stack,
        'Dimensions',
        `${image.originalWidth} x ${image.originalHeight}`
      )}
    {/if}
    {#if image.capturedAt}
      {@render MetadataRow(Calendar, 'Captured', formatDate(image.capturedAt))}
    {/if}
    {#if image.originalFilename && image.originalExtension}
      {@render MetadataRow(
        Document,
        'Filename',
        `${image.originalFilename}.${image.originalExtension}`
      )}
    {/if}
    {#if image.credit}
      {@render MetadataRow(AtSymbol, 'Credit', image.credit)}
    {/if}
  </div>
</div>
