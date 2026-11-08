<script lang="ts">
import type { Component } from 'svelte'
import { onDestroy } from 'svelte'
import { formatDate } from '#lib'
import { m } from '#lib/i18n.js'
import { runRemoteQuery } from '#lib/remote/index.js'
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import Popover from '#lib/bits/core/popover/Popover.svelte'
// LOCAL
import {
  buildAssetAnalyticsPreviewUrl,
  normalizeAssetAnalyticsPublicId,
} from '../assetAnalyticsDashboard.utils'
// ICONS
import Camera from 'virtual:icons/proicons/camera'
import Square2Stack from 'virtual:icons/proicons/copy'
import Document from 'virtual:icons/proicons/file-text'
import AtSymbol from 'virtual:icons/proicons/mention'
import Calendar from 'virtual:icons/proicons/calendar'

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
    const { getMetadata } = await import('#lib/api/image.remote.js')
    const response = await runRemoteQuery(
      getMetadata({
        publicId,
        env: environment ?? undefined,
        profile: 'basic',
        meta: {
          isAdminRequest: true,
        },
      }),
    )

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
  contentClass="z-50 w-[18rem] rounded-[1.25rem] border border-foreground/10 bg-panel p-3 shadow-2xl"
>
  {#snippet trigger()}
    <button
      type="button"
      class="text-foreground hover:text-info focus-visible:ring-info/40 w-full text-left font-mono text-xs underline decoration-dotted underline-offset-4 transition focus-visible:ring-2 focus-visible:outline-none"
      onmouseenter={openPopover}
      onmouseleave={closePopoverSoon}
      onfocus={openPopover}
      onblur={closePopoverSoon}
    >
      {normalizedPublicId}
    </button>
  {/snippet}

  <!-- biome-ignore lint/a11y/noStaticElementInteractions: Hovering the popover content keeps it open while the pointer moves from its trigger. -->
  <div class="space-y-3" onmouseenter={openPopover} onmouseleave={closePopoverSoon}>
    {#if previewFailed}
      <div
        class="border-border bg-surface text-foreground-alt flex h-44 items-center justify-center rounded-[1rem] border border-dashed px-4 text-center text-sm"
      >
        {m.image__metadata_preview_unavailable()}
      </div>
    {:else}
      <img
        src={previewUrl}
        alt={normalizedPublicId}
        class="border-border bg-surface h-44 w-full rounded-[1rem] border object-cover"
        loading="lazy"
        onerror={() => {
          previewFailed = true
        }}
      >
    {/if}

    <div class="space-y-1">
      <div
        class="text-foreground-alt text-[11px] font-semibold tracking-[0.18em] uppercase"
      >
        {m.analytics__public_id()}
      </div>
      <div class="text-foreground font-mono text-xs break-all">
        {normalizedPublicId}
      </div>
    </div>

    <div class="border-border bg-surface rounded-[1rem] border px-3 py-3">
      {#if metadataEntries.length > 0}
        <div class="flex flex-col gap-2">
          {#each metadataEntries as entry}
            <div class="text-foreground-alt flex flex-wrap items-center gap-2 text-sm">
              <Icon src={entry.icon} class="text-foreground h-4 w-4 grow-0" />
              <span class="text-foreground font-medium">{entry.label}:</span>
              <span>{entry.value}</span>
            </div>
          {/each}
        </div>
      {:else if isMetadataLoading}
        <div class="text-foreground-alt text-sm">{m.image__metadata_loading()}</div>
      {:else}
        <div class="text-foreground-alt text-sm">{m.image__metadata_empty_image()}</div>
      {/if}
    </div>
  </div>
</Popover>
