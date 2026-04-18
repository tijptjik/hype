<script lang="ts">
// I18N
import { getLocaleKey, m, toFormLocaleRecord } from '$lib/i18n'
// COMPONENTS
import { Icon } from '$lib/bits'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// SERVICES
import { reverseGeocode } from '$lib/api/external/geocoding'
// ENUMS
import { NewFeatureMode } from '$lib/enums'
// ICONS
import Check from 'virtual:icons/lucide/check'
import GlobeAlt from 'virtual:icons/lucide/globe'
import MapPin from 'virtual:icons/lucide/map-pin'
import PencilSquare from 'virtual:icons/lucide/square-pen'
import X from 'virtual:icons/lucide/x'
// TYPES
import type { LocaleKey } from '$lib/types'
import type { Point } from 'geojson'

const appCtx = getAppCtx()
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()

const newFeature = $derived(appCtx.getNewFeature())
const appMainOffsetX = $derived(responsiveCtx.getAppMainOffsetX())
const currentLocaleKey = $derived(getLocaleKey())
const locationHeading = $derived.by(() =>
  responsiveCtx.visibleWindowWidth < 430
    ? m.new_feature__location()
    : m.lazy_round_falcon_shine(),
)

const EMPTY_DISPLAY_ADDRESS: Record<LocaleKey, string> = {
  en: '',
  zhHant: '',
  zhHans: '',
}

let displayAddress = $state<Record<LocaleKey, string>>({ ...EMPTY_DISPLAY_ADDRESS })
let isDisplayAddressGen = $state(true)
let isEditingAddress = $state(false)
let isLoading = $state(false)
let previousMode: NewFeatureMode | null = null
let originalAddress = $state('')
const currentDisplayAddress = $derived(displayAddress[currentLocaleKey] ?? '')

const isValid = $derived.by(() => {
  const coordinates = (newFeature?.feature?.geometry as Point | undefined)?.coordinates
  const currentLocaleAddress = currentDisplayAddress.trim()

  return Boolean(coordinates && currentLocaleAddress)
})

// Normalize locale-keyed display-address state from i18n payloads.
function toDisplayAddressMap(
  i18n:
    | Partial<Record<LocaleKey, { displayAddress?: string | null }>>
    | null
    | undefined,
): Record<LocaleKey, string> {
  return {
    ...EMPTY_DISPLAY_ADDRESS,
    en: i18n?.en?.displayAddress || '',
    zhHant: i18n?.zhHant?.displayAddress || '',
    zhHans: i18n?.zhHans?.displayAddress || '',
  }
}

// Re-sync local editing state from draft or geocoded i18n values.
function syncDisplayAddress(
  i18n:
    | Partial<
        Record<
          LocaleKey,
          { displayAddress?: string | null; displayAddressGen?: boolean }
        >
      >
    | null
    | undefined,
): void {
  displayAddress = toDisplayAddressMap(i18n)
  isDisplayAddressGen = i18n?.[currentLocaleKey]?.displayAddressGen ?? true
  originalAddress = displayAddress[currentLocaleKey] || ''
  isEditingAddress = false
}

$effect(() => {
  const currentMode = appCtx.newFeatureMode
  const isEnteringLocation =
    currentMode === NewFeatureMode.location && previousMode !== NewFeatureMode.location

  if (isEnteringLocation) {
    syncDisplayAddress(toFormLocaleRecord(newFeature?.feature?.i18n))
  }

  previousMode = currentMode
})

function reset(): void {
  isDisplayAddressGen = true
  isEditingAddress = false
  isLoading = false
}

function handleCloseModal(): void {
  reset()
  omniCtx.cancelNewFeature()
}

function handleAccept(): void {
  if (appCtx.newFeatureMode !== NewFeatureMode.location || !isValid || isLoading) return
  appCtx.updateNewFeatureValueI18n('displayAddress', currentDisplayAddress.trim())
  appCtx.updateNewFeatureValueI18n('displayAddressGen', isDisplayAddressGen)
  reset()
  appCtx.setNewFeatureMode(NewFeatureMode.card)
}

function handleStartEditing(): void {
  originalAddress = currentDisplayAddress
  isEditingAddress = true
}

function handleCancelEditing(): void {
  displayAddress = {
    ...displayAddress,
    [currentLocaleKey]: originalAddress,
  }
  isEditingAddress = false
}

async function handleSetLocation(): Promise<void> {
  const center = appCtx.map?.getCenter()
  if (center) {
    appCtx.updateNewFeatureValue('geometry', {
      type: 'Point',
      coordinates: [center.lng, center.lat],
    })
  }

  const coordinates = (appCtx.getNewFeature()?.feature?.geometry as Point | undefined)
    ?.coordinates
  if (!coordinates) return

  isLoading = true

  try {
    const [lng, lat] = coordinates
    const result = await reverseGeocode(lng, lat)

    if (!result) return

    syncDisplayAddress(toFormLocaleRecord(result.i18n))
  } finally {
    isLoading = false
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (appCtx.newFeatureMode !== NewFeatureMode.location) return

  if (event.key === 'Escape') {
    event.preventDefault()
    if (isEditingAddress) {
      handleCancelEditing()
      return
    }

    handleCloseModal()
  }
}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if appCtx.newFeatureMode === NewFeatureMode.location}
  <div class="bits-theme pointer-events-none fixed inset-0 z-[961] text-white">
    <div
      class="absolute left-1/2 top-1/2 flex h-56 w-56 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={`margin-left: ${appMainOffsetX}px;`}
    >
      <div
        class="pointer-events-auto absolute bottom-full left-1/2 mb-6 w-[min(34rem,calc(100vw-2rem))] max-w-[420px] -translate-x-1/2 rounded-[2rem] border border-white/10 bg-black px-6 py-2 shadow-2xl"
      >
        <div class="flex w-full items-center justify-between gap-4">
          <div class="min-w-0">
            <p
              class="flex items-center gap-3 truncate text-lg font-semibold uppercase tracking-[0.18em] text-white"
            >
              <Icon src={MapPin} class="h-5 w-5 text-primary" />
              <span class="truncate">{locationHeading}</span>
            </p>
          </div>
          <button
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/72 transition hover:bg-white/12 hover:text-white"
            onclick={handleCloseModal}
          >
            <Icon src={X} class="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        class="relative flex h-56 w-56 items-center justify-center rounded-full border-4 border-[#4987E2]/90 bg-[#4987E2]/10 shadow-[0_0_60px_rgba(73,135,226,0.16)]"
      >
        <div class="absolute h-3 w-3 rounded-full bg-white"></div>
        <div class="absolute inset-5 rounded-full border border-white/12"></div>
        <div class="absolute inset-10 rounded-full border border-white/8"></div>
      </div>

      <div
        class="pointer-events-auto absolute left-1/2 top-full mt-6 flex w-[min(34rem,calc(100vw-2rem))] max-w-md -translate-x-1/2 flex-col items-center gap-4"
      >
        {#if isLoading}
          <div
            class="inline-flex min-h-14 items-center justify-center rounded-full bg-black px-7 py-4 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-white/72 transition-[padding,width] duration-200"
          >
            {m.new_feature__looking_up_address()}
          </div>
        {:else if isValid}
          <div
            class="w-full max-w-[360px] rounded-[1.75rem] border border-white/10 bg-black px-4 py-2 shadow-2xl"
          >
            <div class="flex items-center gap-3">
              <input
                bind:value={displayAddress[currentLocaleKey]}
                type="text"
                class="h-11 min-w-0 grow rounded-full bg-black/35 px-4 text-sm text-white caret-white placeholder:text-white/34 focus:outline-none disabled:opacity-100"
                placeholder={m.less_quaint_clownfish_succeed()}
                disabled={!isEditingAddress}
                onkeydown={event => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    isEditingAddress = false
                  }
                }}
              >
              {#if isEditingAddress}
                <button
                  type="button"
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/16"
                  onclick={() => {
                    isEditingAddress = false
                  }}
                >
                  <Icon src={Check} class="h-5 w-5 text-primary" />
                </button>
              {:else}
                <button
                  type="button"
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/16"
                  onclick={handleStartEditing}
                >
                  <Icon src={PencilSquare} class="h-5 w-5" />
                </button>
              {/if}
            </div>
          </div>

          <div class="flex w-full flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              class="min-h-12 rounded-full border border-white/10 bg-black px-5 py-3 text-sm font-semibold text-white transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              onclick={handleSetLocation}
              disabled={isLoading}
            >
              {m.new_feature__reacquire_location()}
            </button>
            <button
              type="button"
              class="min-h-12 rounded-full border border-white/10 bg-black px-5 py-3 text-sm font-semibold text-white transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              onclick={handleAccept}
              disabled={!isValid || isLoading}
            >
              {m.close_shy_jurgen_cook()}
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-white/10 bg-black px-8 py-4 text-base font-semibold text-white transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            onclick={handleSetLocation}
            disabled={isLoading}
          >
            <Icon src={GlobeAlt} class="h-5 w-5" />
            {m.new_feature__select_location()}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
