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
import MapPinned from 'virtual:icons/lucide/map-pinned'
import Square2Stack from 'virtual:icons/lucide/copy'
import Document from 'virtual:icons/lucide/file-text'
// TYPES
import type {
  Image,
  ImageMetadataBasic,
  ImageMetadataFull,
} from '$lib/db/zod/schema/image.types'

type MetadataRow = {
  icon: Component
  label: string
  value: string | { primary: string; secondary?: string }
}

let {
  image,
  metadata: metadataProp = undefined,
  loading: loadingProp = undefined,
  enabled = metadataProp !== undefined || loadingProp !== undefined,
}: {
  image: Image
  metadata?: ImageMetadataBasic | ImageMetadataFull | null
  loading?: boolean
  enabled?: boolean
} = $props()

const appCtx = getAppCtx()

let metadata = $state<ImageMetadataFull | null>(null)
let isLoading = $state(false)

function toDisplayFilename(
  filename: string | null | undefined,
  extension: string | null | undefined,
): string | null {
  if (!filename) return null
  return extension ? `${filename}.${extension}` : filename
}

function parseOriginalMetadataSnapshot(
  value: string | null | undefined,
): ImageMetadataFull | null {
  if (!value) return null

  try {
    return JSON.parse(value) as ImageMetadataFull
  } catch {
    return null
  }
}

function toDmsCoordinate(
  value: number,
  positiveLabel: string,
  negativeLabel: string,
): string {
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutesFloat = (absolute - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = (minutesFloat - minutes) * 60
  const direction = value >= 0 ? positiveLabel : negativeLabel

  return `${degrees}° ${minutes}′ ${Math.round(seconds)}″ ${direction}`
}

function formatCoordinatePair(
  latitude: number,
  longitude: number,
): { primary: string; secondary: string } {
  return {
    primary: `LAT ${toDmsCoordinate(latitude, 'N', 'S')}`,
    secondary: `LNG ${toDmsCoordinate(longitude, 'E', 'W')}`,
  }
}

const resolvedMetadata = $derived(metadataProp ?? metadata)
const resolvedLoading = $derived(loadingProp ?? isLoading)
const originalMetadataSnapshot = $derived(
  resolvedMetadata && 'metadata' in resolvedMetadata
    ? parseOriginalMetadataSnapshot(
        resolvedMetadata.metadata?.originalMetadataSnapshot ?? null,
      )
    : null,
)
const originalFilename = $derived(
  toDisplayFilename(
    originalMetadataSnapshot?.originalFilename,
    originalMetadataSnapshot?.originalExtension,
  ),
)
const editedFilename = $derived(
  toDisplayFilename(
    resolvedMetadata?.originalFilename,
    resolvedMetadata?.originalExtension,
  ),
)
const replacementEditedAt = $derived(
  resolvedMetadata && 'metadata' in resolvedMetadata
    ? (resolvedMetadata.metadata?.replacementEditedAt ?? null)
    : null,
)
const replacementEditedBy = $derived(
  resolvedMetadata && 'metadata' in resolvedMetadata
    ? (resolvedMetadata.metadata?.replacementEditedByName ??
        resolvedMetadata.metadata?.replacementEditedByAttribution ??
        resolvedMetadata.metadata?.replacementEditedByUserId ??
        null)
    : null,
)
const replacementEditedWith = $derived(
  resolvedMetadata && 'metadata' in resolvedMetadata
    ? (resolvedMetadata.metadata?.replacementEditedWith ?? null)
    : null,
)

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
    resolvedMetadata.latitude != null && resolvedMetadata.longitude != null
      ? {
          icon: MapPinned,
          label: 'Coordinates',
          value: formatCoordinatePair(
            resolvedMetadata.latitude,
            resolvedMetadata.longitude,
          ),
        }
      : null,
    originalFilename && originalFilename !== editedFilename
      ? {
          icon: Document,
          label: 'Original filename',
          value: originalFilename,
        }
      : null,
    editedFilename
      ? {
          icon: Document,
          label: originalFilename ? 'Edited filename' : m.image__metadata_filename(),
          value: editedFilename,
        }
      : null,
    resolvedMetadata.credit
      ? {
          icon: AtSymbol,
          label: m.admin__forms_project_credit(),
          value: resolvedMetadata.credit,
        }
      : null,
    replacementEditedBy
      ? {
          icon: AtSymbol,
          label: m.image__metadata_edited_by(),
          value: replacementEditedBy,
        }
      : null,
    replacementEditedAt
      ? {
          icon: Calendar,
          label: m.image__metadata_edited_on(),
          value: formatDate(replacementEditedAt),
        }
      : null,
    replacementEditedWith
      ? {
          icon: Document,
          label: m.image__metadata_edited_with(),
          value: replacementEditedWith,
        }
      : null,
  ].filter((row): row is MetadataRow => row !== null)
})

$effect(() => {
  if (metadataProp !== undefined || loadingProp !== undefined) {
    return
  }

  if (!enabled) {
    isLoading = false
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
    profile: 'admin',
    meta: appCtx.isAdmin() ? { isAdminRequest: true } : undefined,
  })
    .then(response => {
      if (image.id !== currentImageId) {
        return
      }

      metadata = (response?.data as ImageMetadataFull | null) ?? null
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
          {#if typeof row.value === 'string'}
            <span>{row.value}</span>
          {:else}
            <div class="flex flex-col gap-0.5">
              <span>
                <span
                  class="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55"
                >
                  LAT
                </span>
                <span class="ml-2">{row.value.primary.replace(/^LAT\s+/, '')}</span>
              </span>
              {#if row.value.secondary}
                <span>
                  <span
                    class="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55"
                  >
                    LNG
                  </span>
                  <span class="ml-2">{row.value.secondary.replace(/^LNG\s+/, '')}</span>
                </span>
              {/if}
            </div>
          {/if}
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
