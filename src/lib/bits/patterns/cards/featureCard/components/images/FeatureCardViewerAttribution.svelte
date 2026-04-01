<script lang="ts">
import { onDestroy } from 'svelte'
import { Popover } from 'bits-ui'
import { formatDate } from '$lib'
import { m } from '$lib/i18n'
import { getMetadata } from '$lib/api/server/image.remote'
import { getUserForAttribution } from '$lib/api/server/user.remote'
import { getAppCtx } from '$lib/context/app.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
import InfoIcon from 'virtual:icons/lucide/info'
import CameraIcon from 'virtual:icons/lucide/camera'
import MapPinIcon from 'virtual:icons/lucide/map-pin'
import type { Component } from 'svelte'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Feature } from '$lib/db/zod/schema/feature.types'

const CLOSE_DELAY_MS = 180

const appCtx = getAppCtx()
const imageCtx = getImageCtx()

let { currentImage }: { currentImage: ImageCtxEnvelope } = $props()

let open = $state(false)
let animateRows = $state(false)
let closeTimeout: ReturnType<typeof setTimeout> | null = null
let contributorAttribution = $state<string | null>(null)
let imageMetadata = $state<{
  credit?: string | null
  capturedAt?: string | null
} | null>(null)

const contextId = $derived(imageCtx.state.context?.ctxId)
const feature = $derived(contextId ? appCtx.features.get(contextId) : undefined)
const contributorName = $derived(
  contributorAttribution ||
    (feature as Feature)?.contributor?.attribution ||
    m.anonymous(),
)
const createdAt = $derived((feature as Feature | undefined)?.createdAt)

function clearCloseTimeout(): void {
  if (!closeTimeout) return

  clearTimeout(closeTimeout)
  closeTimeout = null
}

function openPopover(): void {
  clearCloseTimeout()
  open = true
  animateRows = false
  requestAnimationFrame(() => {
    animateRows = true
  })
}

function closePopoverSoon(): void {
  clearCloseTimeout()
  animateRows = false
  closeTimeout = setTimeout(() => {
    open = false
    closeTimeout = null
  }, CLOSE_DELAY_MS)
}

function togglePopover(): void {
  if (open) {
    closePopoverSoon()
    return
  }

  openPopover()
}

$effect(() => {
  const contributorId = currentImage?.image.contributorId

  if (!contributorId) {
    contributorAttribution = null
    return
  }

  const profile = appCtx.isAdmin() ? 'card' : 'attribution'
  void getUserForAttribution({
    id: contributorId,
    meta: {
      profile,
      ...(appCtx.isAdmin() ? { isAdminRequest: true } : {}),
    },
  })
    .then(user => {
      contributorAttribution = user?.attribution ?? null
    })
    .catch(() => {
      contributorAttribution = null
    })
})

$effect(() => {
  const publicId = currentImage?.image.publicId
  const env = currentImage?.image.env

  if (!publicId) {
    imageMetadata = null
    return
  }

  void getMetadata({
    publicId,
    env: env ?? undefined,
    profile: 'basic',
    meta: {
      ...(appCtx.isAdmin() ? { isAdminRequest: true } : {}),
    },
  })
    .then(response => {
      imageMetadata = response?.data ?? null
    })
    .catch(() => {
      imageMetadata = null
    })
})

onDestroy(() => {
  clearCloseTimeout()
})
</script>

{#snippet metadataRow(
  icon: Component,
  label: string,
  name: string | null,
  date: string | null | undefined,
  delayClass: string
)}
  <div
    class={`flex min-h-[3.25rem] items-start gap-3 rounded-2xl border border-white/10 bg-[rgba(8,10,14,0.96)] px-3 py-2 text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-all duration-300 ${delayClass} ${animateRows ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
  >
    <div
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8"
    >
      <icon class="h-4 w-4 text-white/90"></icon>
    </div>
    <div class="min-w-0 space-y-1">
      <div class="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
        {label}
      </div>
      <div class="break-words text-sm leading-tight text-white/92">
        {@html m.clear_patchy_bobcat_wish({
          name: name || m.jumpy_misty_panther_scold()
        })}
      </div>
      <div class="font-mono text-[11px] uppercase tracking-[0.18em] text-white/55">
        {date ? formatDate(date) : 'Unknown'}
      </div>
    </div>
  </div>
{/snippet}

<Popover.Root bind:open>
  <Popover.Trigger
    aria-label="Open image attribution"
    class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white/92 backdrop-blur-sm transition hover:bg-black/70"
    onclick={togglePopover}
    onmouseenter={openPopover}
    onmouseleave={closePopoverSoon}
    onfocus={openPopover}
    onblur={closePopoverSoon}
  >
    <InfoIcon class="h-3.5 w-3.5" />
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      forceMount
      side="top"
      align="start"
      sideOffset={12}
      class={`bits-theme z-[220] w-[20rem] rounded-[1.5rem] border border-white/10 bg-transparent p-0 shadow-none transition-opacity duration-200 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div class="space-y-2" onmouseenter={openPopover} onmouseleave={closePopoverSoon}>
        {@render metadataRow(
          MapPinIcon,
          'Feature',
          contributorName,
          createdAt,
          'delay-0',
        )}
        {@render metadataRow(
          CameraIcon,
          'Camera',
          currentImage.image.attribution || imageMetadata?.credit || null,
          imageMetadata?.capturedAt || currentImage.image.createdAt,
          'delay-75',
        )}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
