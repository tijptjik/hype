<script lang="ts">
import type { Component } from 'svelte'
import { m } from '$lib/i18n'
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import Camera from 'virtual:icons/lucide/camera'
import Square2Stack from 'virtual:icons/lucide/copy'
import Document from 'virtual:icons/lucide/file-text'
import AtSymbol from 'virtual:icons/lucide/at-sign'
import Calendar from 'virtual:icons/lucide/calendar'
import { formatDate } from '$lib'
import { loadImageMetadata } from '$lib/components/common/imageMetadata'
// TYPES
import type { Image } from '$lib/db/zod/schema/image.types'
import type { ImageMetadataData } from '$lib/components/common/imageMetadata'

let {
  image,
  metadata: metadataProp = undefined,
  loading: loadingProp = undefined,
}: {
  image: Image
  metadata?: ImageMetadataData | null
  loading?: boolean
} = $props()
const appCtx = getAppCtx()
let metadata = $state<ImageMetadataData | null>(null)
let isLoading = $state(false)
const resolvedMetadata = $derived(metadataProp ?? metadata)
const resolvedLoading = $derived(loadingProp ?? isLoading)
const hasMetadata = $derived(
  Boolean(
    resolvedMetadata?.cameraModel ||
      (resolvedMetadata?.originalWidth && resolvedMetadata?.originalHeight) ||
      resolvedMetadata?.capturedAt ||
      (resolvedMetadata?.originalFilename && resolvedMetadata?.originalExtension) ||
      resolvedMetadata?.credit,
  ),
)

$effect(() => {
  if (metadataProp !== undefined || loadingProp !== undefined) {
    return
  }

  if (!image?.publicId) {
    metadata = null
    isLoading = false
    return
  }

  isLoading = true

  void loadImageMetadata(image, appCtx.isAdmin())
    .then(response => {
      metadata = response
      isLoading = false
    })
    .catch(error => {
      metadata = null
      isLoading = false
    })
})
</script>

{#snippet MetadataRow(icon: Component, label: string, value: string)}
  <div class="grid grid-cols-[1rem_1fr] gap-x-2 gap-y-1 text-sm text-white/80">
    <div class="flex items-center justify-center">
      <Icon src={icon} class="h-4 w-4 grow-0" />
    </div>
    <p class="font-medium text-white">{label}</p>
    <div></div>
    <span>{value}</span>
  </div>
{/snippet}

<div
  class="flex min-w-50 items-center gap-3 rounded-lg bg-black p-3 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
>
  <div class="flex flex-col gap-2">
    {#if resolvedMetadata?.cameraModel}
      {@render MetadataRow(Camera, m.camera(), resolvedMetadata.cameraModel)}
    {/if}
    {#if resolvedMetadata?.originalWidth && resolvedMetadata?.originalHeight}
      {@render MetadataRow(
        Square2Stack,
        m.image__metadata_dimensions(),
        `${resolvedMetadata.originalWidth} x ${resolvedMetadata.originalHeight}`
      )}
    {/if}
    {#if resolvedMetadata?.capturedAt}
      {@render MetadataRow(
        Calendar,
        m.weary_bad_dog_revive(),
        formatDate(resolvedMetadata.capturedAt),
      )}
    {/if}
    {#if resolvedMetadata?.originalFilename && resolvedMetadata?.originalExtension}
      {@render MetadataRow(
        Document,
        m.image__metadata_filename(),
        `${resolvedMetadata.originalFilename}.${resolvedMetadata.originalExtension}`
      )}
    {/if}
    {#if resolvedMetadata?.credit}
      {@render MetadataRow(AtSymbol, m.admin__forms_project_credit(), resolvedMetadata.credit)}
    {/if}

    {#if resolvedLoading}
      <div class="text-sm text-white/65">{m.image__metadata_loading()}</div>
    {:else if !hasMetadata}
      <div class="text-sm text-white/65">{m.image__metadata_empty()}</div>
    {/if}
  </div>
</div>
