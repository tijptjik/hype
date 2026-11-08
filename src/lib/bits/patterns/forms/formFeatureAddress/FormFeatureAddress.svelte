<script lang="ts">
// SVELTE
import { onDestroy, type Snippet } from 'svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SelectField } from '#lib/bits/custom/form/index.js'
// ICONS
import CopyIcon from 'virtual:icons/proicons/copy'
import CheckIcon from 'virtual:icons/proicons/checkmark'
import SearchIcon from 'virtual:icons/proicons/search'
// COMPONENTS
import AddressMap from './AddressMap.svelte'
import AddressDetails from './AddressDetails.svelte'
import AddressDivisions from './AddressDivisions.svelte'
// API
import { loadGeocodedAddressUnits } from '#lib/api/external/geocoding.js'
// ADDRESS
import {
  getAddressLocale,
  getAddressDisplay,
  getAddressUnits,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

let {
  address,
  locationControl,
  coordinatesInLocationControl = false,
  locationActions,
  locationMapControls,
  fixedMap = false,
  showMap = true,
  onMapControlsChange,
  locationContent,
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
  onSelectCandidate,
  map,
  onCoordinateChange,
  onLookup,
  onChange,
}: {
  address: FeatureAddress
  coordinatesInLocationControl?: boolean
  locationControl?: Snippet<[Snippet?]>
  locationActions?: Snippet
  locationMapControls?: Snippet
  fixedMap?: boolean
  showMap?: boolean
  onMapControlsChange?: (controls: Snippet | undefined) => void
  locationContent?: Snippet
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
  candidates?: FeatureAddress[]
  onSelectCandidate: (address: FeatureAddress) => void
  map?: Snippet
  onCoordinateChange: (coordinates: number[]) => void
  onLookup: (query?: string) => void
  onChange: (address: FeatureAddress) => void
} = $props()

let lookupQuery = $state('')
$effect(() => {
  lookupQuery = getAddressDisplay(address, getLocaleKey())
})
let divisionDetails = $state<{ key: string; address: FeatureAddress } | null>(null)
const divisionDetailsKey = $derived(
  JSON.stringify([
    address.source.address2dId,
    address.source.addressSnapshotId,
    address.source.records.meta,
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
  if (!selected.source.address2dId || !selected.source.addressSnapshotId) return
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
let copiedCoordinates = $state(false)
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
    ? Number(value).toFixed(5)
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
// A shared editor map owns the overlay while this form retains the search controls.
$effect(() => {
  onMapControlsChange?.(locationMapControls)
})
</script>

{#snippet coordinatesControl()}
  <div
    class="flex min-h-11 max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-panel px-3 py-1 text-foreground"
  >
    {#if isEditing}
      <button
        type="button"
        aria-label={m.admin__geo_lookup_address_at_location()}
        data-tooltip={m.admin__geo_lookup_address_at_location()}
        disabled={!isEditing || isLoading || Boolean(coordinateError)}
        onclick={() => onLookup()}
        class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-35"
      >
        <SearchIcon class="size-4" aria-hidden="true" />
      </button>
    {/if}
    {#each ['longitude', 'latitude'] as const as axis, index}
      {#if index}
        <span aria-hidden="true" class="h-6 w-px bg-foreground/20"></span>
      {/if}
      <div class="flex min-w-0 items-center gap-2">
        <span
          class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >{axis === 'longitude' ? 'LNG' : 'LAT'}</span
        >
        {#if isEditing}
          <input
            type="text"
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
            class="w-20 min-w-0 rounded-md bg-transparent py-2 text-sm tabular-nums outline-none transition-[width] focus:w-44 focus:ring-2 focus:ring-primary @max-[1100px]:focus:w-32"
            onfocus={() => (focusedCoordinate = axis)}
            oninput={event => {
              if (axis === 'longitude') longitude = event.currentTarget.value
              else latitude = event.currentTarget.value
            }}
            onblur={() => {
              moveMarker()
              focusedCoordinate = null
            }}
            onkeydown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
          >
        {:else}
          <span class="w-20 py-2 text-sm tabular-nums"
            >{compactCoordinate(String(coordinates[index] ?? ''))}</span
          >
        {/if}
      </div>
    {/each}
    <button
      type="button"
      onclick={copyCoordinates}
      aria-label={copiedCoordinates
        ? m.feature_address_coordinates_copied()
        : m.feature_address_copy_coordinates()}
      data-tooltip={m.feature_address_copy_coordinates()}
      class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      {#if copiedCoordinates}
        <CheckIcon class="size-4 text-success" aria-hidden="true" />
      {:else}
        <CopyIcon class="size-4" aria-hidden="true" />
      {/if}
    </button>
    <span class="sr-only" role="status"
      >{coordinateCopyFailed
        ? m.feature_address_coordinates_copy_failed()
        : copiedCoordinates
          ? m.feature_address_coordinates_copied()
          : ''}</span
    >
  </div>
{/snippet}
{#snippet lookupControl()}
  <div
    class="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-panel py-1 pl-3 pr-1 text-foreground"
  >
    <input
      type="text"
      aria-label={m.feature_address_lookup()}
      placeholder={m.feature_address_lookup()}
      bind:value={lookupQuery}
      readonly={!isEditing}
      class="min-w-0 flex-1 rounded-md bg-transparent py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
      class="size-10 shrink-0 rounded-full text-primary"
      disabled={!isEditing || isLoading || !lookupQuery.trim()}
      onClick={() => onLookup(lookupQuery.trim())}
    />
  </div>
{/snippet}
<AddressMap
  {locationControl}
  {coordinatesInLocationControl}
  {locationActions}
  {locationMapControls}
  {fixedMap}
  {showMap}
  {showLookup}
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
  class={fixedMap
    ? hideDetails
      ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
      : 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-12'
    : ''}
  data-address-scroll
>
  {#if locationContent}
    {@render locationContent()}
  {/if}
  {#if !hideDetails}
    {#if coordinateError ||
      message ||
      address.matchStatus === 'stale' ||
      address.matchStatus === 'ambiguous'}
      <div class="px-6 py-3">
        {#if coordinateError}
          <p role="alert" class="text-sm text-error">{coordinateError}</p>
        {/if}
        {#if message ||
          address.matchStatus === 'stale' ||
          address.matchStatus === 'ambiguous'}
          <p role="status" class="text-sm text-muted-foreground">{message || status}</p>
        {/if}
      </div>
    {/if}
    {#if candidates.length}
      <div class="space-y-2 border-b border-border px-6 py-5">
        <h3 class="text-sm font-semibold">{m.feature_address_choose_result()}</h3>
        <div class="grid gap-2">
          {#each candidates as candidate, index}
            <button
              type="button"
              disabled={isLoading}
              onclick={() => onSelectCandidate(candidate)}
              class="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-left text-foreground transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-50"
            >
              <span class="text-xs text-muted-foreground">{index + 1}</span>
              <span class="flex-1 text-sm"
                >{String(
                  getAddressLocale(candidate, getLocaleKey()).formattedAddress ||
                    getAddressDisplay(candidate, getLocaleKey()),
                )}</span
              >
              <span class="text-xs text-primary">{m.feature_address_select()}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if showAddressDetails && show3dAddressOptions && units.length}
      <div class="border-b border-border px-6 py-6">
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
                records: divisionAddress.source.records,
                address3dId: selected?.inventoryId ?? null,
                address3dUnitId: selected?.value ?? null,
              },
            })
          }}
        />
      </div>
    {/if}
    <div
      class="grid items-start gap-8 border-t border-border/60 px-6 py-6 lg:grid-cols-2"
    >
      {#if showAddressDetails}
        <AddressDetails {address} {isEditing} {show3dAddressOptions} {hasLocation} onChange={next => { if (!hasLocation && next.coordinates) onCoordinateChange(next.coordinates); onChange(next) }} />
      {/if}
      {#if showDivisions}
        <AddressDivisions
          class="lg:border-t-0 lg:pt-0"
          {address}
          {coordinates}
          {isEditing}
          {onChange}
        />
      {/if}
    </div>
  {/if}
</div>
