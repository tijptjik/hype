<script lang="ts">
import type { Component } from 'svelte'
import { onDestroy } from 'svelte'
import { formatDate } from '$lib'
import { m } from '$lib/i18n'
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import Popover from '$lib/bits/core/popover/Popover.svelte'
// REMOTE
import { getMetadata } from '$lib/api/server/image.remote'
// LOCAL
import {
  buildAssetAnalyticsPreviewUrl,
  normalizeAssetAnalyticsPublicId,
} from '../assetAnalyticsDashboard.utils'
// ICONS
import Camera from 'virtual:icons/lucide/camera'
import Square2Stack from 'virtual:icons/lucide/copy'
import Document from 'virtual:icons/lucide/file-text'
import AtSymbol from 'virtual:icons/lucide/at-sign'
import Calendar from 'virtual:icons/lucide/calendar'

let {
  publicId,
  environment,
}: {
  publicId: string
  environment?: string | null
} = $props()

let open = $state(false)
let closeTimeout: ReturnType<typeof setTimeout> | null = null
let metadata = $state<{
  originalFilename?: string | null
  originalExtension?: string | null
  originalWidth?: number | null
  originalHeight?: number | null
  cameraModel?: string | null
  capturedAt?: string | null
  credit?: string | null
} | null>(null)
let isMetadataLoading = $state(false)
let previewFailed = $state(false)

type MetadataEntry = {
  icon: Component
  label: string
  value: string
}

const normalizedPublicId = $derived(normalizeAssetAnalyticsPublicId(publicId))
const previewUrl = $derived(
  buildAssetAnalyticsPreviewUrl({
    publicId,
    environment,
  }),
)

$effect(() => {
  publicId
  metadata = null
  isMetadataLoading = false
  previewFailed = false
})

const metadataEntries = $derived.by<MetadataEntry[]>(() => {
  if (!metadata) return []

  return [
    metadata.cameraModel
      ? { icon: Camera, label: 'Camera', value: metadata.cameraModel }
      : null,
    metadata.originalWidth && metadata.originalHeight
      ? {
          icon: Square2Stack,
          label: 'Dimensions',
          value: `${metadata.originalWidth} x ${metadata.originalHeight}`,
        }
      : null,
    metadata.capturedAt
      ? {
          icon: Calendar,
          label: 'Captured',
          value: formatDate(metadata.capturedAt),
        }
      : null,
    metadata.originalFilename && metadata.originalExtension
      ? {
          icon: Document,
          label: 'Filename',
          value: `${metadata.originalFilename}.${metadata.originalExtension}`,
        }
      : null,
    metadata.credit
      ? {
          icon: AtSymbol,
          label: 'Credit',
          value: metadata.credit,
        }
      : null,
  ].filter((entry): entry is MetadataEntry => entry !== null)
})

function cancelClose(): void {
  if (!closeTimeout) return
  clearTimeout(closeTimeout)
  closeTimeout = null
}

async function loadMetadata(): Promise<void> {
  if (metadata || isMetadataLoading || !publicId) return

  isMetadataLoading = true

  try {
    const response = await getMetadata({
      publicId,
      env: environment ?? undefined,
      profile: 'basic',
      meta: {
        isAdminRequest: true,
      },
    })

    metadata = response?.data ?? null
  } catch {
    metadata = null
  } finally {
    isMetadataLoading = false
  }
}

function openPopover(): void {
  cancelClose()
  open = true
  void loadMetadata()
}

function closePopoverSoon(): void {
  cancelClose()
  closeTimeout = setTimeout(() => {
    open = false
    closeTimeout = null
  }, 80)
}

onDestroy(() => {
  cancelClose()
})
</script>

<Popover
  bind:open
  contentProps={{ side: 'left', align: 'start', sideOffset: 12 }}
  contentClass="z-50 w-[18rem] rounded-[1.25rem] border border-white/10 bg-[rgb(9,11,14)] p-3 shadow-2xl"
>
  {#snippet trigger()}
    <button
      type="button"
      class="w-full text-left font-mono text-xs text-foreground underline decoration-dotted underline-offset-4 transition hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40"
      onmouseenter={openPopover}
      onmouseleave={closePopoverSoon}
      onfocus={openPopover}
      onblur={closePopoverSoon}
    >
      {normalizedPublicId}
    </button>
  {/snippet}

  <div class="space-y-3" onmouseenter={openPopover} onmouseleave={closePopoverSoon}>
    {#if previewFailed}
      <div
        class="flex h-44 items-center justify-center rounded-[1rem] border border-dashed border-base-300 bg-[#121212] px-4 text-center text-sm text-foreground-alt"
      >
        {m.image__metadata_preview_unavailable()}
      </div>
    {:else}
      <img
        src={previewUrl}
        alt={normalizedPublicId}
        class="h-44 w-full rounded-[1rem] border border-base-300 bg-[#121212] object-cover"
        loading="lazy"
        onerror={() => {
          previewFailed = true
        }}
      >
    {/if}

    <div class="space-y-1">
      <div
        class="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-alt"
      >
        {m.analytics__public_id()}
      </div>
      <div class="break-all font-mono text-xs text-foreground">
        {normalizedPublicId}
      </div>
    </div>

    <div class="rounded-[1rem] border border-base-300 bg-[#121212] px-3 py-3">
      {#if metadataEntries.length > 0}
        <div class="flex flex-col gap-2">
          {#each metadataEntries as entry}
            <div class="flex flex-wrap items-center gap-2 text-sm text-foreground-alt">
              <Icon src={entry.icon} class="h-4 w-4 grow-0 text-foreground" />
              <span class="font-medium text-foreground">{entry.label}:</span>
              <span>{entry.value}</span>
            </div>
          {/each}
        </div>
      {:else if isMetadataLoading}
        <div class="text-sm text-foreground-alt">{m.image__metadata_loading()}</div>
      {:else}
        <div class="text-sm text-foreground-alt">{m.image__metadata_empty_image()}</div>
      {/if}
    </div>
  </div>
</Popover>
