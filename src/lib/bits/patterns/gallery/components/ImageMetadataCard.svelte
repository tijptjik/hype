<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
// LIB
import { Icon } from '$lib/bits'
import { getMetadata } from '$lib/api/server/image.remote'
import { getAppCtx } from '$lib/context/app.svelte'
import { m } from '$lib/i18n'
import { formatDate } from '$lib'
// ICONS
import AtSymbol from 'virtual:icons/lucide/at-sign'
import Calendar from 'virtual:icons/lucide/calendar'
import Camera from 'virtual:icons/lucide/camera'
import Square2Stack from 'virtual:icons/lucide/copy'
import Document from 'virtual:icons/lucide/file-text'
// TYPES
import type { Image, ImageMetadataBasic } from '$lib/db/zod/schema/image.types'

type MetadataRow = {
  icon: Component
  label: string
  value: string
}

let {
  image,
  metadata: metadataProp = undefined,
  loading: loadingProp = undefined,
}: {
  image: Image
  metadata?: ImageMetadataBasic | null
  loading?: boolean
} = $props()

const appCtx = getAppCtx()

let metadata = $state<ImageMetadataBasic | null>(null)
let isLoading = $state(false)

const resolvedMetadata = $derived(metadataProp ?? metadata)
const resolvedLoading = $derived(loadingProp ?? isLoading)

const metadataRows = $derived.by<MetadataRow[]>(() => {
  if (!resolvedMetadata) return []

  return [
    resolvedMetadata.cameraModel
      ? {
          icon: Camera,
          label: m.camera(),
          value: resolvedMetadata.cameraModel,
        }
      : null,
    resolvedMetadata.originalWidth && resolvedMetadata.originalHeight
      ? {
          icon: Square2Stack,
          label: m.image__metadata_dimensions(),
          value: `${resolvedMetadata.originalWidth} x ${resolvedMetadata.originalHeight}`,
        }
      : null,
    resolvedMetadata.capturedAt
      ? {
          icon: Calendar,
          label: m.weary_bad_dog_revive(),
          value: formatDate(resolvedMetadata.capturedAt),
        }
      : null,
    resolvedMetadata.originalFilename && resolvedMetadata.originalExtension
      ? {
          icon: Document,
          label: m.image__metadata_filename(),
          value: `${resolvedMetadata.originalFilename}.${resolvedMetadata.originalExtension}`,
        }
      : null,
    resolvedMetadata.credit
      ? {
          icon: AtSymbol,
          label: m.admin__forms_project_credit(),
          value: resolvedMetadata.credit,
        }
      : null,
  ].filter((row): row is MetadataRow => row !== null)
})

$effect(() => {
  if (metadataProp !== undefined || loadingProp !== undefined) {
    return
  }

  if (!image?.publicId) {
    metadata = null
    isLoading = false
    return
  }

  const currentImageId = image.id
  isLoading = true

  void getMetadata({
    publicId: image.publicId,
    env: image.env ?? undefined,
    version: image.version ?? undefined,
    profile: 'basic',
    meta: appCtx.isAdmin() ? { isAdminRequest: true } : undefined,
  })
    .then(response => {
      if (image.id !== currentImageId) {
        return
      }

      metadata = response?.data ?? null
      isLoading = false
    })
    .catch(() => {
      if (image.id !== currentImageId) {
        return
      }

      metadata = null
      isLoading = false
    })
})
</script>

<div
  class="flex min-w-50 items-center gap-3 rounded-xl border border-white/10 bg-black p-3 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
>
  <div class="flex flex-col gap-2">
    {#if metadataRows.length > 0}
      {#each metadataRows as row}
        <div class="grid grid-cols-[1rem_1fr] gap-x-2 gap-y-1 text-sm text-white/80">
          <div class="flex items-center justify-center">
            <Icon src={row.icon} class="h-4 w-4 grow-0 text-white" />
          </div>
          <p class="font-medium text-white">{row.label}</p>
          <div></div>
          <span>{row.value}</span>
        </div>
      {/each}
    {/if}

    {#if resolvedLoading}
      <div class="text-sm text-white/65">{m.image__metadata_loading()}</div>
    {:else if metadataRows.length === 0}
      <div class="text-sm text-white/65">{m.image__metadata_empty()}</div>
    {/if}
  </div>
</div>
