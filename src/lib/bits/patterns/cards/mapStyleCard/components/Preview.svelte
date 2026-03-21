<script lang="ts">
import { dev } from '$app/environment'
import LoaderCircleIcon from 'virtual:icons/lucide/loader-circle'

import type { MapStyleCardPreviewProps } from '../mapStyleCard.types'

let {
  image = null,
  alt = null,
  styleCode = null,
  class: className = '',
}: MapStyleCardPreviewProps = $props()

let displayImage = $state(image)
let isGenerating = $state(false)
let hasTriggeredGeneration = $state(false)

const POLL_INTERVAL_MS = 1_500
const MAX_POLL_ATTEMPTS = 8

$effect(() => {
  displayImage = image
  isGenerating = false
  hasTriggeredGeneration = false
})

const refreshDisplayImage = (): void => {
  if (!image) return

  const separator = image.includes('?') ? '&' : '?'
  displayImage = `${image}${separator}t=${Date.now()}`
}

const pollForPreview = async (): Promise<void> => {
  if (!styleCode) return

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise(resolve => window.setTimeout(resolve, POLL_INTERVAL_MS))

    let response: Response

    try {
      response = await fetch(`/api/mapPreviews/styles/${styleCode}`, {
        headers: {
          Accept: 'application/json',
        },
      })
    } catch {
      break
    }

    if (!response.ok) {
      break
    }

    const payload = (await response.json()) as {
      exists: boolean
      pending: boolean
    }

    if (payload.exists) {
      refreshDisplayImage()
      isGenerating = false
      return
    }

    if (!payload.pending) {
      break
    }
  }

  isGenerating = false
}

const ensurePreviewGenerated = async (event?: Event): Promise<void> => {
  event?.preventDefault()
  event?.stopPropagation()
  if (!dev || !image || !styleCode || isGenerating || hasTriggeredGeneration) {
    return
  }

  hasTriggeredGeneration = true
  isGenerating = true

  try {
    const response = await fetch(`/api/mapPreviews/styles/${styleCode}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      isGenerating = false
      return
    }

    await pollForPreview()
  } catch {
    isGenerating = false
  }
}
</script>

<div class={`bits-map-style-card__preview ${className}`}>
  {#if displayImage}
    <img
      src={displayImage}
      alt={alt ?? ''}
      class="bits-map-style-card__preview-image"
      loading="lazy"
      onerror={event => {
        event.preventDefault()
        event.stopPropagation()
        const element = event.currentTarget
        if (element instanceof HTMLImageElement) {
          element.onerror = null
        }
        void ensurePreviewGenerated(event)
      }}
    >
    {#if isGenerating}
      <div class="bits-map-style-card__preview-status">
        <LoaderCircleIcon class="bits-map-style-card__preview-spinner" />
      </div>
    {/if}
  {:else}
    <div class="bits-map-style-card__preview-fallback">{alt?.charAt(0) ?? '?'}</div>
  {/if}
</div>
