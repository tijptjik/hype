<script lang="ts">
// I18N
import { getLocaleKey, m, toFormLocaleRecord } from '#lib/i18n.js'
// COMPONENTS
import { Icon } from '#lib/bits/index.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getOmniCtx } from '#lib/context/omni.svelte.js'
import {
  getSurfaceLayoutCtx,
  SurfaceLayout,
} from '#lib/context/surfaceLayout.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
// SERVICES
import { reverseGeocode } from '#lib/api/external/geocoding.js'
// ENUMS
import { NewFeatureMode } from '#lib/enums.js'
// ICONS
import Check from 'virtual:icons/proicons/checkmark'
import GlobeAlt from 'virtual:icons/proicons/globe'
import MapPin from 'virtual:icons/proicons/location'
import PencilSquare from 'virtual:icons/proicons/compose'
import X from 'virtual:icons/proicons/cancel'
// TYPES
import type { LocaleKey } from '#lib/types.js'
import type { Point } from 'geojson'

let { getMapCenter }: { getMapCenter?: () => [number, number] | null } = $props()

const appCtx = getSurfaceCtx()
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()
const surfaceLayout = getSurfaceLayoutCtx() ?? new SurfaceLayout(responsiveCtx)

const newFeature = $derived(appCtx.draft.current)
const appMainOffsetX = $derived(surfaceLayout.getAppMainOffsetX())
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
  const currentMode = appCtx.draft.mode
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
  if (appCtx.draft.mode !== NewFeatureMode.location || !isValid || isLoading) return
  appCtx.draft.updateI18n('displayAddress', currentDisplayAddress.trim())
  appCtx.draft.updateI18n('displayAddressGen', isDisplayAddressGen)
  reset()
  appCtx.draft.setMode(NewFeatureMode.card)
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
  const center = getMapCenter?.()
  if (center) {
    appCtx.draft.updateField('geometry', {
      type: 'Point',
      coordinates: center,
    })
  }

  const coordinates = (appCtx.draft.current?.feature?.geometry as Point | undefined)
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
  if (appCtx.draft.mode !== NewFeatureMode.location) return

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

{#if appCtx.draft.mode === NewFeatureMode.location}
  <div class="bits-theme pointer-events-none fixed inset-0 z-[961] text-base-content">
    <div
      class="absolute left-1/2 top-1/2 flex h-56 w-56 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={`margin-left: ${appMainOffsetX}px;`}
    >
      <div
        class="pointer-events-auto absolute bottom-full left-1/2 mb-6 w-[min(34rem,calc(100vw-2rem))] max-w-[420px] -translate-x-1/2 rounded-[2rem] border border-border bg-panel px-6 py-2 shadow-2xl"
      >
        <div class="flex w-full items-center justify-between gap-4">
          <div class="min-w-0">
            <p
              class="flex items-center gap-3 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-semibold uppercase tracking-[0.18em] text-base-content"
            >
              <Icon src={MapPin} class="h-5 w-5 text-primary" />
              <span class="overflow-hidden text-ellipsis whitespace-nowrap"
                >{locationHeading}</span
              >
            </p>
          </div>
          <button
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition hover:bg-raised hover:text-base-content"
            onclick={handleCloseModal}
          >
            <Icon src={X} class="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        class="relative flex h-56 w-56 items-center justify-center rounded-full border-4 border-primary/90 bg-primary/10 shadow-[0_0_60px_color-mix(in_oklab,var(--color-primary)_16%,transparent)]"
      >
        <div class="absolute h-3 w-3 rounded-full bg-primary"></div>
        <div class="absolute inset-5 rounded-full border border-primary/20"></div>
        <div class="absolute inset-10 rounded-full border border-primary/15"></div>
      </div>

      <div
        class="pointer-events-auto absolute left-1/2 top-full mt-6 flex w-[min(34rem,calc(100vw-2rem))] max-w-md -translate-x-1/2 flex-col items-center gap-4"
      >
        {#if isLoading}
          <div
            class="inline-flex min-h-14 items-center justify-center rounded-full bg-panel px-7 py-4 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground transition-[padding,width] duration-200"
          >
            {m.new_feature__looking_up_address()}
          </div>
        {:else if isValid}
          <div
            class="w-full max-w-[360px] rounded-[1.75rem] border border-border bg-panel px-4 py-2 shadow-2xl"
          >
            <div class="flex items-center gap-3">
              <input
                bind:value={displayAddress[currentLocaleKey]}
                type="text"
                class="h-11 min-w-0 grow rounded-full bg-surface px-4 text-sm text-base-content caret-primary placeholder:text-muted-foreground focus:outline-none disabled:opacity-100"
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
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-base-content transition hover:bg-raised"
                  onclick={() => {
                    isEditingAddress = false
                  }}
                >
                  <Icon src={Check} class="h-5 w-5 text-primary" />
                </button>
              {:else}
                <button
                  type="button"
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-base-content transition hover:bg-raised"
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
              class="min-h-12 rounded-full border border-border bg-panel px-5 py-3 text-sm font-semibold text-base-content transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              onclick={handleSetLocation}
              disabled={isLoading}
            >
              {m.new_feature__reacquire_location()}
            </button>
            <button
              type="button"
              class="min-h-12 rounded-full border border-border bg-panel px-5 py-3 text-sm font-semibold text-base-content transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              onclick={handleAccept}
              disabled={!isValid || isLoading}
            >
              {m.close_shy_jurgen_cook()}
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-border bg-panel px-8 py-4 text-base font-semibold text-base-content transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
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
