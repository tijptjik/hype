<script lang="ts">
import {
  AddressMetaSchema,
  emptyFeatureAddress,
  setAddressOverride,
} from '#lib/addresses/featureAddress.js'
// SVELTE
import { onDestroy } from 'svelte'
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
import { geocodeBuilding } from '#lib/api/external/buildingGeocoding.js'
import type { SelectedBuilding } from '#lib/map/buildingAddress.js'
import type { ParsedReverseGeocodeResult } from '#lib/utils/geocoding.types.js'
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

let {
  getMapCenter,
  getBuildingAt,
}: {
  getMapCenter?: () => [number, number] | null
  getBuildingAt?: (point: [number, number]) => Promise<SelectedBuilding | null>
} = $props()
let resolvedAddress = $state<ParsedReverseGeocodeResult | null>(null)

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
let addressGenerated = $state<Record<LocaleKey, boolean>>({
  en: true,
  zhHant: true,
  zhHans: true,
})
let isEditingAddress = $state(false)
let isLoading = $state(false)
let previousMode: NewFeatureMode | null = null
let originalAddress = $state('')
let originalAddressGen = true
let lookupStatus = $state<'idle' | 'not_found' | 'error'>('idle')
let lookupRevision = 0

// Invalidate pending responses when the pinpointer is unmounted.
onDestroy(() => {
  lookupRevision++
})
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
  addressGenerated = {
    en: i18n?.en?.displayAddressGen ?? true,
    zhHant: i18n?.zhHant?.displayAddressGen ?? true,
    zhHans: i18n?.zhHans?.displayAddressGen ?? true,
  }
  originalAddress = displayAddress[currentLocaleKey] || ''
  isEditingAddress = false
}

$effect(() => {
  const currentMode = appCtx.draft.mode
  const isEnteringLocation =
    currentMode === NewFeatureMode.location && previousMode !== NewFeatureMode.location

  if (isEnteringLocation) {
    const saved = toFormLocaleRecord(newFeature?.feature?.i18n)
    syncDisplayAddress(saved)
    resolvedAddress = newFeature?.feature?.addressMeta
      ? {
          addressMeta: AddressMetaSchema.parse(newFeature.feature.addressMeta),
          i18n: Object.fromEntries(
            (['en', 'zhHant', 'zhHans'] as LocaleKey[]).map(locale => [
              locale,
              {
                displayAddress: saved?.[locale]?.displayAddress ?? '',
                displayAddressGen: saved?.[locale]?.displayAddressGen ?? false,
                addressProperties: saved?.[locale]?.addressProperties ?? {},
              },
            ]),
          ) as ParsedReverseGeocodeResult['i18n'],
        }
      : null
  }

  if (
    currentMode !== NewFeatureMode.location &&
    previousMode === NewFeatureMode.location
  ) {
    lookupRevision++
    isLoading = false
    lookupStatus = 'idle'
  }
  previousMode = currentMode
})

function reset(): void {
  lookupRevision++
  lookupStatus = 'idle'
  addressGenerated = { en: true, zhHant: true, zhHans: true }
  isEditingAddress = false
  isLoading = false
}

function handleCloseModal(): void {
  reset()
  omniCtx.cancelNewFeature()
}

function handleAccept(): void {
  if (appCtx.draft.mode !== NewFeatureMode.location || !isValid || isLoading) return
  const centre = getMapCenter?.()
  const selected = (appCtx.draft.current?.feature?.geometry as Point | undefined)
    ?.coordinates
  if (
    centre &&
    selected &&
    (Math.abs(centre[0] - selected[0]) > 1e-8 ||
      Math.abs(centre[1] - selected[1]) > 1e-8)
  ) {
    // Reacquire instead of accepting an address belonging to a different building.
    void handleSetLocation()
    return
  }
  const metadata = resolvedAddress?.addressMeta ?? {}
  let address = metadata.address ?? emptyFeatureAddress()
  for (const locale of Object.keys(displayAddress) as LocaleKey[]) {
    if (!addressGenerated[locale])
      address = setAddressOverride(
        address,
        locale,
        'formattedAddress',
        displayAddress[locale].trim(),
      )
  }
  appCtx.draft.updateField('addressMeta', { ...metadata, address })
  for (const locale of Object.keys(displayAddress) as LocaleKey[]) {
    appCtx.draft.updateI18n(
      'addressProperties',
      addressGenerated[locale]
        ? (resolvedAddress?.i18n[locale].addressProperties ?? {})
        : {},
      locale,
    )
    appCtx.draft.updateI18n('displayAddress', displayAddress[locale].trim(), locale)
    appCtx.draft.updateI18n('displayAddressGen', addressGenerated[locale], locale)
  }
  reset()
  appCtx.draft.setMode(NewFeatureMode.card)
}

function handleStartEditing(): void {
  originalAddress = currentDisplayAddress
  originalAddressGen = addressGenerated[currentLocaleKey]
  isEditingAddress = true
}

function handleCancelEditing(): void {
  displayAddress = {
    ...displayAddress,
    [currentLocaleKey]: originalAddress,
  }
  addressGenerated[currentLocaleKey] = originalAddressGen
  isEditingAddress = false
}

/**
 * Resolves the current pin while ignoring results from superseded selections.
 * @returns Resolves when this request settles.
 * @remarks Failure clears the old address so it cannot be accepted for a different pin.
 */
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

  const revision = ++lookupRevision
  const draft = appCtx.draft.current
  const [lng, lat] = coordinates
  isLoading = true
  lookupStatus = 'idle'
  syncDisplayAddress(null)
  resolvedAddress = null

  // Check both request order and the active draft before applying asynchronous results.
  const isCurrent = (): boolean =>
    revision === lookupRevision &&
    appCtx.draft.mode === NewFeatureMode.location &&
    appCtx.draft.current === draft
  try {
    const building = (await getBuildingAt?.([lng, lat])) ?? null
    if (!isCurrent()) return
    const result = await geocodeBuilding({ lng, lat }, building)
    if (!isCurrent()) return
    if (!result) {
      lookupStatus = 'not_found'
      isEditingAddress = true
      return
    }
    resolvedAddress = result
    syncDisplayAddress(toFormLocaleRecord(result.i18n))
  } catch {
    if (!isCurrent()) return
    lookupStatus = 'error'
    isEditingAddress = true
  } finally {
    if (revision === lookupRevision) isLoading = false
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
  <div class="bits-theme text-base-content pointer-events-none fixed inset-0 z-[961]">
    <div
      class="absolute top-1/2 left-1/2 flex h-56 w-56 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={`margin-left: ${appMainOffsetX}px;`}
    >
      <div
        class="border-border bg-panel pointer-events-auto absolute bottom-full left-1/2 mb-6 w-[min(34rem,calc(100vw-2rem))] max-w-[420px] -translate-x-1/2 rounded-[2rem] border px-6 py-2 shadow-2xl"
      >
        <div class="flex w-full items-center justify-between gap-4">
          <div class="min-w-0">
            <p
              class="text-base-content flex items-center gap-3 overflow-hidden text-lg font-semibold tracking-[0.18em] text-ellipsis whitespace-nowrap uppercase"
            >
              <Icon src={MapPin} class="text-primary h-5 w-5" />
              <span class="overflow-hidden text-ellipsis whitespace-nowrap"
                >{locationHeading}</span
              >
            </p>
          </div>
          <button
            type="button"
            class="border-border bg-surface text-muted-foreground hover:bg-raised hover:text-base-content flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition"
            onclick={handleCloseModal}
          >
            <Icon src={X} class="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        class="border-primary/90 bg-primary/10 relative flex h-56 w-56 items-center justify-center rounded-full border-4 shadow-[0_0_60px_color-mix(in_oklab,var(--color-primary)_16%,transparent)]"
      >
        <div class="bg-primary absolute h-3 w-3 rounded-full"></div>
        <div class="border-primary/20 absolute inset-5 rounded-full border"></div>
        <div class="border-primary/15 absolute inset-10 rounded-full border"></div>
      </div>

      <div
        class="pointer-events-auto absolute top-full left-1/2 mt-6 flex w-[min(34rem,calc(100vw-2rem))] max-w-md -translate-x-1/2 flex-col items-center gap-4"
      >
        {#if isLoading}
          <div
            class="bg-panel text-muted-foreground inline-flex min-h-14 items-center justify-center rounded-full px-7 py-4 text-center font-mono text-[11px] tracking-[0.28em] uppercase transition-[padding,width] duration-200"
          >
            {m.new_feature__looking_up_address()}
          </div>
        {:else if isValid || isEditingAddress || lookupStatus !== 'idle'}
          {#if resolvedAddress?.addressMeta.addressMatch === 'nearest'}
            <p
              role="status"
              class="bg-panel text-base-content rounded-2xl px-4 py-2 text-center text-sm"
            >
              {m.new_feature__approximate_address()}
            </p>
          {/if}
          {#if lookupStatus !== 'idle'}
            <p
              role="status"
              class="bg-panel text-base-content rounded-2xl px-4 py-2 text-center text-sm"
            >
              {lookupStatus === 'not_found'
                ? m.new_feature__address_not_found()
                : m.new_feature__address_lookup_failed()}
            </p>
          {/if}
          <div
            class="border-border bg-panel w-full max-w-[360px] rounded-[1.75rem] border px-4 py-2 shadow-2xl"
          >
            <div class="flex items-center gap-3">
              <input
                bind:value={displayAddress[currentLocaleKey]}
                aria-label={m.less_quaint_clownfish_succeed()}
                oninput={() => {
                  addressGenerated[currentLocaleKey] = false
                }}
                type="text"
                class="bg-surface text-base-content caret-primary placeholder:text-muted-foreground h-11 min-w-0 grow rounded-full px-4 text-sm focus:outline-none disabled:opacity-100"
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
                  class="border-border bg-surface text-base-content hover:bg-raised flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
                  onclick={() => {
                    isEditingAddress = false
                  }}
                >
                  <Icon src={Check} class="text-primary h-5 w-5" />
                </button>
              {:else}
                <button
                  type="button"
                  class="border-border bg-surface text-base-content hover:bg-raised flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
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
              class="border-border bg-panel text-base-content hover:text-primary min-h-12 rounded-full border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              onclick={handleSetLocation}
              disabled={isLoading}
            >
              {m.new_feature__reacquire_location()}
            </button>
            <button
              type="button"
              class="border-border bg-panel text-base-content hover:text-primary min-h-12 rounded-full border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              onclick={handleAccept}
              disabled={!isValid || isLoading}
            >
              {m.close_shy_jurgen_cook()}
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="border-border bg-panel text-base-content hover:text-primary inline-flex min-h-14 items-center justify-center gap-3 rounded-full border px-8 py-4 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
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
