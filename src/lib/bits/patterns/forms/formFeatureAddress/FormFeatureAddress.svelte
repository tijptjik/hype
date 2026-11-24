<script lang="ts">
// COMPONENTS
// SVELTE
import { onDestroy, tick, type Snippet } from 'svelte'
// I18N
import { getLocaleKey, m, toLocaleKey } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SelectField } from '#lib/bits/custom/form/index.js'
// ICONS
import CopyIcon from 'virtual:icons/proicons/copy'
import CheckIcon from 'virtual:icons/proicons/checkmark'
import SatelliteIcon from 'virtual:icons/lucide/satellite'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import SearchIcon from 'virtual:icons/proicons/search'
import ChevronDownIcon from 'virtual:icons/lucide/chevron-down'
// COMPONENTS
import AddressMap from './AddressMap.svelte'
import AddressEditorLayout from './AddressEditorLayout.svelte'
import AddressDisplayField from './AddressDisplayField.svelte'
// API
import { loadGeocodedAddressUnits } from '#lib/api/external/geocoding.js'
// ADDRESS
import { hasStructuredAddressComponents } from '#lib/addresses/presentation.js'
import { parseCoordinateInput } from '#lib/addresses/coordinateInput.js'
import { nearbyAddressCandidates } from '#lib/addresses/nearbyCandidates.js'
import {
  ADDRESS_LOCALES,
  getAddressLocale,
  getAddressDisplay,
  getAddressUnits,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { ProfileLocaleState } from '../featureLocation/profileLocales.js'
import type { AccessibilityDraft } from '#lib/locations/accessibility.js'
import type { NearbyStreet } from '#lib/map/nearbyStreets.js'
import type { AddressName } from '#lib/addresses/nameCatalogue.js'
import { addressNameLabel } from '#lib/addresses/nameSearch.js'
import type { AddressDivision } from '#lib/addresses/divisions.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { BuildingSource } from '#lib/locations/buildingSource.js'

let {
  address,
  activeBuildingSource,
  activeLocationNames,
  isLocationReplacementDraft = false,
  onMakeBuildingActive,
  localeState,
  onLocaleStateChange,
  translations = $bindable(false),
  onBuildingNameBlur,
  onSuggestStreetNumber,
  locationKind,
  identityFields,
  identityControls,
  identityInfo,
  locationControl,
  centerLocationControl = false,
  coordinatesInLocationControl = false,
  displayAddressInToolbar = false,
  primaryDisplay,
  locationActions,
  toolbarControls,
  toolbarInfo,
  toolbarInfoBeforeCoordinates = false,
  locationMapControls,
  fixedMap = false,
  showMap = true,
  onMapControlsChange,
  locationContent,
  accessibilityLocationId,
  accessibilityDraft,
  accessibilityDraftKey,
  onAccessibilityDraftChange,
  hideDetails = false,
  showAddressDetails = true,
  showDivisions = true,
  showCoordinates = true,
  hasLocation = true,
  showLookup = true,
  onCoordinateValidityChange,
  coordinates,
  isEditing,
  isLoading,
  show3dAddressOptions = true,
  message = '',
  candidates = [],
  streetCandidates = [],
  onSelectStreet,
  onCancelLookup,
  onSelectCandidate,
  onPreviewCandidate,
  map,
  onCoordinateChange,
  onLookup,
  onMatchLocation,
  onChange,
}: {
  address: FeatureAddress
  activeBuildingSource?: BuildingSource
  activeLocationNames?: Record<string, string>
  isLocationReplacementDraft?: boolean
  onMakeBuildingActive?: (selection: {
    source: BuildingSource
    address: FeatureAddress
    names: Record<string, string>
  }) => void
  localeState?: ProfileLocaleState
  onLocaleStateChange?: (state: ProfileLocaleState) => void
  translations?: boolean
  onBuildingNameBlur?: () => void
  onSuggestStreetNumber?: () => Promise<string | null>
  locationKind?: string
  identityFields?: Snippet<[boolean]>
  identityControls?: Snippet
  identityInfo?: Snippet
  coordinatesInLocationControl?: boolean
  displayAddressInToolbar?: boolean
  primaryDisplay?: (tag: string) => string
  locationControl?: Snippet<[Snippet?]>
  centerLocationControl?: boolean
  toolbarControls?: Snippet
  toolbarInfo?: Snippet
  toolbarInfoBeforeCoordinates?: boolean
  locationActions?: Snippet
  locationMapControls?: Snippet
  fixedMap?: boolean
  showMap?: boolean
  onMapControlsChange?: (controls: Snippet | undefined) => void
  locationContent?: Snippet
  accessibilityLocationId?: string
  accessibilityDraft?: AccessibilityDraft
  accessibilityDraftKey?: string
  onAccessibilityDraftChange?: (value: AccessibilityDraft | undefined) => void
  hideDetails?: boolean
  showAddressDetails?: boolean
  showDivisions?: boolean
  showCoordinates?: boolean
  hasLocation?: boolean
  showLookup?: boolean
  onCoordinateValidityChange?: (valid: boolean) => void
  coordinates: number[]
  isEditing: boolean
  isLoading: boolean
  show3dAddressOptions?: boolean
  message?: string
  streetCandidates?: NearbyStreet[]
  onSelectStreet?: (street: AddressName) => void
  onCancelLookup?: () => void
  candidates?: FeatureAddress[]
  onPreviewCandidate?: (address: FeatureAddress | null) => void
  onSelectCandidate: (address: FeatureAddress) => void
  map?: Snippet
  onCoordinateChange: (coordinates: number[]) => void
  onMatchLocation?: () => void
  onLookup: (query?: string) => void
  onChange: (address: FeatureAddress) => void
} = $props()

let localLocaleState = $state<ProfileLocaleState>({
  selectedLocales: ['en', 'zh-Hant', 'zh-Hans'],
  visibleLocales: ['en', 'zh-Hant', 'zh-Hans'],
  expanded: false,
})
const addressLocaleState = $derived(localeState ?? localLocaleState)
const displayLocale = $derived(
  toLocaleKey((addressLocaleState.selectedLocales[0] ?? 'en').toLowerCase()),
)
/** Keep the toolbar and editor on the same ordered locale state.
 * @param state Updated editor locale order and visibility. @returns Nothing.
 */
function changeLocaleState(state: ProfileLocaleState): void {
  localLocaleState = state
  onLocaleStateChange?.(state)
}

const showEmptyAddressActions = $derived(
  isEditing &&
    !hideDetails &&
    showAddressDetails &&
    !hasStructuredAddressComponents(address),
)

// Location matching owns address enrichment, including premises without a street.
const nearbyCandidates = $derived(nearbyAddressCandidates(candidates, coordinates))
let lookupQuery = $state('')
$effect(() => {
  lookupQuery = getAddressDisplay(address, getLocaleKey())
})
let divisionDetails = $state<{ key: string; address: FeatureAddress } | null>(null)
const divisionDetailsKey = $derived(
  JSON.stringify([
    address.source.address2dId,
    address.source.snapshotId,
    address.source.rawSource.meta,
  ]),
)
const divisionAddress = $derived(
  divisionDetails?.key === divisionDetailsKey ? divisionDetails.address : address,
)
$effect(() => {
  const selected = address
  const key = divisionDetailsKey
  if (
    divisionDetails?.key === key ||
    !show3dAddressOptions ||
    getAddressUnits(selected, getLocaleKey()).length > 0
  ) {
    return
  }
  if (!selected.source.address2dId || !selected.source.snapshotId) return
  let cancelled = false
  // Hydrate older saved selections without editing their coordinates or corrections.
  loadGeocodedAddressUnits(selected)
    .then(result => {
      if (cancelled) return
      divisionDetails = { key, address: result }
    })
    .catch(() => {
      // Retain the original publication when optional unit hydration is unavailable.
    })
  return () => {
    cancelled = true
  }
})
// Lookup results retain their shared scroll surface; the three-column editor owns separate panes.
const independentScroll = $derived(
  fixedMap &&
    isEditing &&
    showAddressDetails &&
    !hideDetails &&
    !candidates.length &&
    !streetCandidates.length,
)
let copiedCoordinates = $state(false)
let toolbarWidth = $state(0)
let resolvedDivisions = $state<{
  coordinates: number[]
  divisions: AddressDivision[]
} | null>(null)
// Latch the last successful geography so pin movement cannot blank the display address.
const divisions = $derived(resolvedDivisions?.divisions ?? [])
const divisionsStale = $derived(
  resolvedDivisions !== null &&
    JSON.stringify(resolvedDivisions.coordinates.slice(0, 2)) !==
      JSON.stringify(coordinates.slice(0, 2)),
)
const coordinateDigits = 4
// Density is calculated from full-size offscreen groups, never from the collapsed widget.
let coordinatesCompact = $state(false)
let coordinateCopyFailed = $state(false)
let coordinateCopyTimer: ReturnType<typeof setTimeout> | undefined
onDestroy(() => clearTimeout(coordinateCopyTimer))

/** Copies the saved coordinate pair at full precision, in displayed longitude/latitude order.
 * @returns Resolves after the clipboard feedback is updated.
 */
async function copyCoordinates(): Promise<void> {
  coordinateCopyFailed = false
  try {
    await navigator.clipboard.writeText(`${coordinates[0]}, ${coordinates[1]}`)
    copiedCoordinates = true
    clearTimeout(coordinateCopyTimer)
    coordinateCopyTimer = setTimeout(() => {
      copiedCoordinates = false
    }, 2000)
  } catch {
    coordinateCopyFailed = true
  }
}

let focusedCoordinate = $state<'longitude' | 'latitude' | null>(null)
let lastCoordinate = $state<'longitude' | 'latitude'>('longitude')
let coordinatesOpen = $state(false)
let coordinatesTrigger: HTMLSpanElement | undefined = $state()
let committingCoordinate = false
const coordinateDialogId = $props.id()
let longitude = $state('')
let latitude = $state('')
let coordinateError = $state('')
$effect(() => {
  onCoordinateValidityChange?.(!coordinateError)
})
$effect(() => {
  longitude = String(coordinates[0] ?? '')
  latitude = String(coordinates[1] ?? '')
  coordinateError = ''
})
const units = $derived(getAddressUnits(divisionAddress, getLocaleKey()))
const status = $derived(
  address.matchStatus === 'stale'
    ? m.feature_address_stale()
    : address.matchStatus === 'ambiguous'
      ? m.feature_address_ambiguous()
      : address.source.status === 'resolved'
        ? m.feature_address_resolved()
        : m.feature_address_unresolved(),
)

/** Formats the idle field without rounding its editable or stored value.
 * @param value Full-precision coordinate text. @returns A compact coordinate label.
 */
function compactCoordinate(value: string): string {
  return value.trim() && Number.isFinite(Number(value))
    ? Number(value).toFixed(coordinateDigits)
    : value
}

/** Applies only a valid WGS84 coordinate pair. @returns Nothing; invalid input stays local. */
function moveMarker(): void {
  const lng = Number(longitude),
    lat = Number(latitude)
  if (
    !longitude.trim() ||
    !latitude.trim() ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90
  ) {
    coordinateError = m.feature_address_coordinates_invalid()
    return
  }
  coordinateError = ''
  if (lng !== coordinates[0] || lat !== coordinates[1]) onCoordinateChange([lng, lat])
}

/** Apply a pasted pair atomically; ordinary single-value paste keeps native input behavior.
 * @param event Clipboard event from either coordinate field.
 * @returns Nothing; valid pairs update both fields and the marker together.
 */
function pasteCoordinates(event: ClipboardEvent): void {
  const point = parseCoordinateInput(event.clipboardData?.getData('text/plain') ?? '')
  if (!point) return
  event.preventDefault()
  longitude = String(point[0])
  latitude = String(point[1])
  moveMarker()
}

/** Commit Enter without losing the keyboard path back into coordinate editing.
 * @param event Key event from a coordinate input.
 * @returns Completion after focus returns to the satellite control.
 */
async function commitCoordinate(
  event: KeyboardEvent & { currentTarget: HTMLInputElement },
): Promise<void> {
  if (event.key !== 'Enter' || event.isComposing) return
  event.preventDefault()
  event.stopPropagation()
  if (event.repeat) return
  moveMarker()
  if (coordinateError) return
  // The commit already applied this value; blur only leaves editing mode.
  committingCoordinate = true
  event.currentTarget.blur()
  committingCoordinate = false
  coordinatesOpen = false
  await tick()
  coordinatesTrigger?.parentElement?.focus({ preventScroll: true })
}

/** Reopen the coordinate editor from its trigger and restore the last edited axis.
 * @param event Keyboard activation of the satellite control.
 * @returns Completion after the requested input receives focus.
 */
async function enterCoordinates(event: KeyboardEvent): Promise<void> {
  if ((event.key !== 'Enter' && event.key !== ' ') || event.isComposing) return
  event.preventDefault()
  event.stopPropagation()
  if (event.repeat) return
  coordinatesOpen = true
  if (!isEditing) return
  await tick()
  document
    .getElementById(coordinateDialogId)
    ?.querySelector<HTMLInputElement>(`[data-coordinate-axis="${lastCoordinate}"]`)
    ?.focus({ preventScroll: true })
}
// A shared editor map owns the overlay while this form retains the search controls.
$effect(() => {
  onMapControlsChange?.(locationMapControls)
})
</script>

{#snippet expandedCoordinatesControl()}
  <div
    class="border-border bg-panel text-foreground flex h-11 w-max flex-nowrap items-center gap-2 rounded-lg border py-0 pr-1 pl-2 whitespace-nowrap"
  >
    {#if isEditing && !displayAddressInToolbar && address.matchStatus !== 'resolved'}
      <button
        type="button"
        aria-label={m.admin__geo_lookup_address_at_location()}
        data-tooltip={m.admin__geo_lookup_address_at_location()}
        disabled={!isEditing || isLoading || Boolean(coordinateError)}
        onclick={() => onLookup()}
        class="text-muted-foreground hover:text-primary focus-visible:outline-primary flex size-8 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-2 disabled:opacity-35"
      >
        <SearchIcon class="size-4" aria-hidden="true" />
      </button>
    {/if}
    {#each ['longitude', 'latitude'] as const as axis, index}
      {#if index}
        <span aria-hidden="true" class="bg-foreground/20 h-6 w-px"></span>
      {/if}
      <div class="flex shrink-0 items-center gap-0.5">
        <span
          class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
          >{axis === 'longitude' ? 'LNG' : 'LAT'}</span
        >
        {#if isEditing}
          <!-- Measure the rendered value, including its narrower decimal point, rather than reserving whole character cells. -->
          <div
            class="grid min-w-0 grid-cols-[minmax(0,1fr)] {focusedCoordinate === axis
              ? 'w-44 @max-[1100px]:w-32'
              : 'w-max'}"
          >
            <span
              aria-hidden="true"
              class="invisible col-start-1 row-start-1 px-3 text-sm whitespace-pre tabular-nums"
              >{compactCoordinate(axis === 'longitude' ? longitude : latitude)}</span
            >
            <input
              type="text"
              data-coordinate-axis={axis}
              size="1"
              inputmode="decimal"
              aria-label={axis === 'longitude'
                ? m.admin__geo_longitude()
                : m.admin__geo_latitude()}
              aria-invalid={Boolean(coordinateError)}
              value={focusedCoordinate === axis
                ? axis === 'longitude'
                  ? longitude
                  : latitude
                : compactCoordinate(axis === 'longitude' ? longitude : latitude)}
              class="focus:bg-primary/5 col-start-1 row-start-1 w-full min-w-0 rounded-md bg-transparent px-3 py-2 text-sm tabular-nums outline-0! focus:ring-0!"
              onfocus={() => {
                focusedCoordinate = axis
                lastCoordinate = axis
              }}
              oninput={event => {
                if (axis === 'longitude') longitude = event.currentTarget.value
                else latitude = event.currentTarget.value
              }}
              onpaste={pasteCoordinates}
              onblur={() => {
                if (!committingCoordinate) moveMarker()
                focusedCoordinate = null
              }}
              onkeydown={commitCoordinate}
            >
          </div>
        {:else}
          <span class="px-3 py-2 text-sm tabular-nums"
            >{compactCoordinate(String(coordinates[index] ?? ''))}</span
          >
        {/if}
      </div>
    {/each}
    <button
      type="button"
      onclick={copyCoordinates}
      data-coordinate-copy
      aria-label={copiedCoordinates
        ? m.feature_address_coordinates_copied()
        : m.feature_address_copy_coordinates()}
      data-tooltip={m.feature_address_copy_coordinates()}
      class="text-muted-foreground hover:text-primary focus-visible:outline-primary -ml-1 flex size-7 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-2"
    >
      {#if copiedCoordinates}
        <CheckIcon class="text-success size-4" aria-hidden="true" />
      {:else}
        <CopyIcon class="size-4" aria-hidden="true" />
      {/if}
    </button>
  </div>
{/snippet}
{#snippet coordinatesControl()}
  <div class="flex shrink-0 items-center gap-2">
    {#if displayAddressInToolbar || toolbarControls || coordinatesCompact}
      <SimpleTooltip
        bind:open={coordinatesOpen}
        triggerClass="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
        triggerProps={{
          role: 'button',
          'aria-label': m.location_review_coordinates(),
          onkeydown: enterCoordinates,
        }}
        contentProps={{
          id: coordinateDialogId,
          role: 'dialog',
          'aria-label': m.location_review_coordinates(),
          side: 'bottom',
          align: 'end',
        }}
        contentClass="w-max max-w-[calc(100vw-2rem)] bg-base-100 p-2"
      >
        {#snippet trigger()}
          <span
            bind:this={coordinatesTrigger}
            class="text-muted-foreground hover:bg-primary/10 hover:text-primary flex size-10 items-center justify-center rounded-lg transition"
            data-compact-coordinates
          >
            <SatelliteIcon class="size-5" aria-hidden="true" />
          </span>
        {/snippet}
        {@render expandedCoordinatesControl()}
      </SimpleTooltip>
    {:else}
      {@render expandedCoordinatesControl()}
    {/if}
  </div>
  <span class="sr-only" role="status"
    >{coordinateCopyFailed
      ? m.feature_address_coordinates_copy_failed()
      : copiedCoordinates
        ? m.feature_address_coordinates_copied()
        : ''}</span
  >
{/snippet}
{#snippet lookupControl()}
  <div
    class="border-border bg-panel text-foreground flex min-h-11 items-center gap-2 rounded-lg border py-1 pr-1 pl-3"
  >
    <input
      type="text"
      aria-label={m.feature_address_lookup()}
      placeholder={m.feature_address_lookup()}
      bind:value={lookupQuery}
      readonly={!isEditing}
      class="focus-visible:ring-primary min-w-0 flex-1 rounded-md bg-transparent py-2 text-sm outline-none focus-visible:ring-2"
      onkeydown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          const query = lookupQuery.trim()
          if (query && isEditing && !isLoading) onLookup(query)
        }
      }}
    >
    <Button
      text={m.feature_address_lookup()}
      iconComponent={SearchIcon}
      hideLabel={true}
      hideLabelInstantly={true}
      style="transparent"
      size="sm"
      class="text-primary size-10 shrink-0 rounded-full"
      disabled={!isEditing || isLoading || !lookupQuery.trim()}
      onClick={() => onLookup(lookupQuery.trim())}
    />
  </div>
{/snippet}
{#snippet addressToolbar(coordinateControl?: Snippet)}
  <div class="contents">
    <div
      class="w-max min-w-0 shrink-0 {toolbarWidth > 0 && toolbarWidth < 640
        ? 'col-start-1 row-start-1'
        : ''}"
      data-address-toolbar-location
    >
      {@render locationControl?.(coordinateControl)}
    </div>
    <div
      class="min-w-0 max-w-full flex-1 basis-0 space-y-2 {toolbarWidth > 0 &&
      toolbarWidth < 640
        ? 'col-span-2 row-start-2 w-full'
        : ''}"
      data-address-toolbar-display
    >
      <AddressDisplayField
        {coordinates}
        centered={true}
        availableWidth={toolbarWidth}
        showDisplayChoice
        stale={divisionsStale}
        {locationKind}
        {divisions}
        {address}
        locale={displayLocale}
        displayText={primaryDisplay?.(addressLocaleState.selectedLocales[0] ?? 'en')}
        isEditing={isEditing && !primaryDisplay}
        alignEnd={false}
        scrollWhenConstrained={true}
        {onChange}
      />
    </div>
  </div>
{/snippet}
<AddressMap
  bind:toolbarWidth
  bind:coordinatesCompact
  measurementCoordinates={expandedCoordinatesControl}
  measurementKey={`${primaryDisplay?.(addressLocaleState.selectedLocales[0] ?? 'en') ?? getAddressDisplay(address, displayLocale, divisions, locationKind)}:${Object.hasOwn(address.overrides[ADDRESS_LOCALES[displayLocale]] ?? {}, 'formattedAddress')}`}
  singleRowToolbar={displayAddressInToolbar}
  {centerLocationControl}
  locationControl={displayAddressInToolbar ? addressToolbar : locationControl}
  {coordinatesInLocationControl}
  locationActions={showEmptyAddressActions ? undefined : locationActions}
  {toolbarControls}
  {toolbarInfo}
  {toolbarInfoBeforeCoordinates}
  {locationMapControls}
  {fixedMap}
  {showMap}
  showLookup={showLookup && !displayAddressInToolbar}
  {map}
  {coordinatesControl}
  {showCoordinates}
  {lookupControl}
  {onLookup}
  {isEditing}
  {isLoading}
  canLookup={isEditing && !coordinateError}
  sourceId={address.matchStatus === 'resolved' && address.source.status === 'resolved'
    ? address.source.address2dId
    : null}
/>
<div
  class="select-none [&_input]:select-text [&_textarea]:select-text {fixedMap
    ? independentScroll
      ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
      : 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain'
    : ''}"
  data-address-scroll
>
  {#if locationContent}
    {@render locationContent()}
  {/if}
  {#if !hideDetails}
    {#if coordinateError || message || address.matchStatus === 'stale'}
      <div class="px-6 py-3">
        {#if coordinateError}
          <p role="alert" class="text-error text-sm">{coordinateError}</p>
        {/if}
        {#if message || address.matchStatus === 'stale'}
          <p role="status" class="text-muted-foreground text-sm">{message || status}</p>
        {/if}
      </div>
    {/if}
    {#if onCancelLookup &&
      !streetCandidates.length &&
      !candidates.length &&
      (isLoading || message)}
      <div class="flex justify-end px-6 py-2">
        <button
          type="button"
          onclick={onCancelLookup}
          class="text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-primary rounded-md px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {m.cancel()}
        </button>
      </div>
    {/if}
    {#if streetCandidates.length && onSelectStreet}
      <div class="border-border relative border-b">
        {#if onCancelLookup}
          <button
            type="button"
            onclick={onCancelLookup}
            class="text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-primary absolute top-3 right-6 z-10 rounded-md px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {m.cancel()}
          </button>
        {/if}
        <details class="group/streets space-y-2 px-6 py-3">
          <summary
            class="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden {onCancelLookup
              ? 'pr-20'
              : ''}"
          >
            <span
              >{m.feature_address_nearby_streets()}
              <span class="text-muted-foreground text-xs font-normal"
                >({streetCandidates.length})</span
              ></span
            >
            <ChevronDownIcon
              class="size-4 shrink-0 transition-transform group-open/streets:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div class="flex items-start justify-between gap-3 pt-2">
            <p class="text-muted-foreground text-xs">
              {m.feature_address_nearby_streets_hint()}
            </p>
          </div>
          <!-- Fit four single-line choices; wrapped names grow and additional results scroll within the review. -->
          <div
            class="grid max-h-[calc(4*3rem+3*0.5rem)] grid-cols-1 gap-2 overflow-y-auto overscroll-contain"
            data-nearby-street-results
          >
            {#each streetCandidates as { street, distance } (street.id)}
              {@const streetLabel =
                addressNameLabel(street, getLocaleKey()) ||
                street.name ||
                addressNameLabel(street, 'en') ||
                Object.values(street.names).find(name => name.trim())}
              <button
                type="button"
                disabled={isLoading || !isEditing}
                onclick={() => onSelectStreet?.(street)}
                class="border-border bg-background text-foreground hover:border-primary hover:bg-primary/10 grid min-h-12 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors disabled:opacity-50"
              >
                <span class="min-w-0 text-sm break-words whitespace-normal"
                  >{streetLabel}</span
                >
                <span class="text-muted-foreground shrink-0 text-xs tabular-nums"
                  >{Math.round(distance).toLocaleString()}
                  m</span
                >
                <span class="text-primary text-xs whitespace-nowrap"
                  >{m.feature_address_use_street()}</span
                >
              </button>
            {/each}
          </div>
        </details>
      </div>
    {/if}
    {#if candidates.length}
      <div class="border-border space-y-2 border-b px-6 py-5">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-semibold">{m.feature_address_choose_result()}</h3>
          {#if onCancelLookup && !(streetCandidates.length && onSelectStreet)}
            <button
              type="button"
              onclick={onCancelLookup}
              class="text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-primary rounded-md px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {m.cancel()}
            </button>
          {/if}
        </div>
        <div class="grid gap-2">
          {#each nearbyCandidates as { candidate, distance }, index}
            <button
              type="button"
              disabled={isLoading}
              onclick={() => onSelectCandidate(candidate)}
              onmouseenter={() => onPreviewCandidate?.(candidate)}
              onmouseleave={() => onPreviewCandidate?.(null)}
              onfocus={() => onPreviewCandidate?.(candidate)}
              onblur={() => onPreviewCandidate?.(null)}
              class="border-border bg-background text-foreground hover:border-primary hover:bg-primary/10 flex items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors disabled:opacity-50"
            >
              <span class="text-muted-foreground text-xs">{index + 1}</span>
              <span class="flex-1 text-sm"
                >{String(
                  getAddressLocale(candidate, getLocaleKey()).formattedAddress ||
                    getAddressDisplay(candidate, getLocaleKey()),
                )}</span
              >
              {#if distance !== null}
                <span class="text-muted-foreground shrink-0 text-xs tabular-nums"
                  >{Math.round(distance).toLocaleString()}
                  m</span
                >
              {/if}
              <span class="text-primary text-xs">{m.feature_address_select()}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if showAddressDetails && show3dAddressOptions && units.length}
      <div class="border-border border-b px-6 py-6">
        <SelectField
          label={m.feature_address_unit()}
          items={units}
          value={address.source.address3dUnitId ?? ''}
          {isEditing}
          allowDeselect={true}
          onValueChange={value => {
            const selected = units.find(unit => unit.value === value)
            onChange({
              ...address,
              source: {
                ...address.source,
                rawSource: divisionAddress.source.rawSource,
                address3dId: selected?.inventoryId ?? null,
                address3dUnitId: selected?.value ?? null,
              },
            })
          }}
        />
      </div>
    {/if}
    <AddressEditorLayout
      {coordinates}
      {showAddressDetails}
      {showDivisions}
      fallbackWidth={toolbarWidth}
      onResolved={value => (resolvedDivisions = value)}
      onDivisionsChange={onChange}
      displayStale={divisionsStale}
      {onMatchLocation}
      emptyAddressActions={showEmptyAddressActions ? locationActions : undefined}
      localeState={addressLocaleState}
      onLocaleStateChange={changeLocaleState}
      {independentScroll}
      {activeBuildingSource}
      {activeLocationNames}
      {isLocationReplacementDraft}
      {onMakeBuildingActive}
      {onBuildingNameBlur}
      {onSuggestStreetNumber}
      suggestionKey={JSON.stringify([
        coordinates,
        address.source,
        accessibilityDraftKey,
      ])}
      {identityControls}
      {identityInfo}
      {identityFields}
      {accessibilityDraft}
      {accessibilityDraftKey}
      {onAccessibilityDraftChange}
      {locationKind}
      {accessibilityLocationId}
      {divisions}
      {address}
      {isEditing}
      hideDisplayAddress={displayAddressInToolbar}
      bind:translations
      {show3dAddressOptions}
      {hasLocation}
      onChange={next => {
        if (!hasLocation && next.coordinates) onCoordinateChange(next.coordinates)
        onChange(next)
      }}
    />
  {/if}
</div>
