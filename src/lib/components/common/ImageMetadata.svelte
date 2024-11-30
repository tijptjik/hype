<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  Camera,
  Square2Stack,
  Document,
  AtSymbol,
  Calendar
} from '@steeze-ui/heroicons';
import { formatDate } from '$lib';
// TYPES
import type { GetImageAPI, ImageUploadRefs as Refs } from '$lib/types';
import type { IconSource } from '@steeze-ui/svelte-icon';

let { image }: { image: GetImageAPI } = $props();
</script>

{#snippet MetadataRow(icon: IconSource, label: string, value: string)}
  <div class="flex items-center gap-2 text-sm text-base-content/80">
    <Icon src={icon} class="h-4 w-4 flex-grow-0" />
    <p class="font-medium">{label}:</p>
    <span>{value}</span>
  </div>
{/snippet}

<div
  class="flex min-w-[200px] items-center gap-3 rounded-lg bg-base-200/70 p-3 backdrop-blur-sm">
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
