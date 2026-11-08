<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
// LIB
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import { getMetadata } from '#lib/api/image.remote.js'
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { m } from '#lib/i18n.js'
import { formatDate } from '#lib'
// ICONS
import AtSymbol from 'virtual:icons/proicons/mention'
import Calendar from 'virtual:icons/proicons/calendar'
import Camera from 'virtual:icons/proicons/camera'
import MapPinned from 'virtual:icons/proicons/location'
import Square2Stack from 'virtual:icons/proicons/copy'
import Document from 'virtual:icons/proicons/file-text'
// TYPES
import type {
  Image,
  ImageMetadataBasic,
  ImageMetadataFull,
} from '#lib/db/zod/schema/image.types.js'

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
  image?: Image
  metadata?: ImageMetadataBasic | ImageMetadataFull | null
  loading?: boolean
  enabled?: boolean
} = $props()

const appCtx = getSurfaceCtx()

let metadata = $state<ImageMetadataFull | null>(null)
let isLoading = $state(false)

function toDisplayFilename(
  filename: string | null | undefined,
  extension: string | null | undefined,
): string | null {
  if (!filename) return null
  const fullFilename =
    extension && !filename.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
      ? `${filename}.${extension}`
      : filename
  return fullFilename
}

function abbreviateFilename(filename: string): string {
  const characters = Array.from(filename)
  return characters.length > 32
    ? `${characters.slice(0, 16).join('')}...${characters.slice(-16).join('')}`
    : filename
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

function hasFiniteCoordinates(
  latitude: string | number | null | undefined,
  longitude: string | number | null | undefined,
): boolean {
  return (
    latitude != null &&
    longitude != null &&
    latitude !== '' &&
    longitude !== '' &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  )
}

const resolvedMetadata = $derived<ImageMetadataFull | null>(metadataProp ?? metadata)
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

  const rows: Array<MetadataRow | null> = [
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
    hasFiniteCoordinates(resolvedMetadata.latitude, resolvedMetadata.longitude)
      ? {
          icon: MapPinned,
          label: 'Coordinates',
          value: formatCoordinatePair(
            Number(resolvedMetadata.latitude),
            Number(resolvedMetadata.longitude),
          ),
        }
      : null,
    originalFilename && originalFilename !== editedFilename
      ? {
          icon: Document,
          label: 'Original filename',
          value: abbreviateFilename(originalFilename),
        }
      : null,
    editedFilename
      ? {
          icon: Document,
          label: originalFilename ? 'Edited filename' : m.image__metadata_filename(),
          value: abbreviateFilename(editedFilename),
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
  ]
  return rows.filter((row): row is MetadataRow => row !== null)
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
    profile: appCtx.isAdmin() ? 'admin' : 'basic',
    meta: appCtx.isAdmin() ? { isAdminRequest: true } : undefined,
  })
    .then(response => {
      if (image?.id !== currentImageId) {
        return
      }

      metadata = (response?.data as ImageMetadataFull | null) ?? null
      isLoading = false
    })
    .catch(() => {
      if (image?.id !== currentImageId) {
        return
      }

      metadata = null
      isLoading = false
    })
})
</script>

<div
  class="border-border bg-panel text-base-content max-h-[min(28rem,calc(100dvh-6rem))] w-max max-w-[min(20rem,calc(100vw-3rem))] min-w-0 overflow-y-auto rounded-xl border p-3 shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
>
  <div class="flex min-w-0 flex-col gap-2">
    {#if metadataRows.length > 0}
      {#each metadataRows as row}
        <div
          class="text-muted-foreground grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm"
        >
          <div class="flex items-center justify-center">
            <Icon src={row.icon} class="text-base-content h-4 w-4 grow-0" />
          </div>
          <p
            class="text-base-content min-w-0 font-medium break-words whitespace-normal"
          >
            {row.label}
          </p>
          <div></div>
          {#if typeof row.value === 'string'}
            <span class="min-w-0 [overflow-wrap:anywhere] whitespace-normal"
              >{row.value}</span
            >
          {:else}
            <div class="flex min-w-0 flex-col gap-0.5 break-words whitespace-normal">
              <span>
                <span
                  class="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase"
                >
                  LAT
                </span>
                <span class="ml-2">{row.value.primary.replace(/^LAT\s+/, '')}</span>
              </span>
              {#if row.value.secondary}
                <span>
                  <span
                    class="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase"
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
      <div class="text-muted-foreground text-sm">{m.image__metadata_loading()}</div>
    {:else if metadataRows.length === 0}
      <div class="text-muted-foreground text-sm">{m.image__metadata_empty()}</div>
    {/if}
  </div>
</div>
