<script lang="ts">
// SVELTE
import { onDestroy, type Snippet } from 'svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, TextInput, SelectField } from '#lib/bits/custom/form/index.js'
import {
  EDITABLE_ADDRESS_FIELDS,
  getExpressionSuggestions,
  setAddressExpression,
  getAddressDivisions,
  hasAddressDivisionDetails,
  type EditableAddressField,
} from '#lib/addresses/addressExpressions.js'
// ICONS
import CopyIcon from 'virtual:icons/proicons/copy'
import CheckIcon from 'virtual:icons/proicons/checkmark'
import SearchIcon from 'virtual:icons/proicons/search'
import { divisionIcons } from '#lib/divisions/icons.js'
// COMPONENTS
import AddressMap from './AddressMap.svelte'
// API
import { loadGeocodedAddressUnits } from '#lib/api/external/geocoding.js'
// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressLocale,
  getAddressDisplay,
  getAddressUnits,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { FeatureAddress, AddressField } from '#lib/addresses/featureAddress.js'

let {
  address,
  coordinates,
  isEditing,
  isLoading,
  message = '',
  candidates = [],
  onSelectCandidate,
  map,
  onCoordinateChange,
  onLookup,
  onChange,
}: {
  address: FeatureAddress
  coordinates: number[]
  isEditing: boolean
  isLoading: boolean
  message?: string
  candidates?: FeatureAddress[]
  onSelectCandidate: (address: FeatureAddress) => void
  map: Snippet
  onCoordinateChange: (coordinates: number[]) => void
  onLookup: (query?: string) => void
  onChange: (address: FeatureAddress) => void
} = $props()

let addedFields = $state<EditableAddressField[]>([])
const locales = ['en', 'zhHant', 'zhHans'] as const
const visibleFields = $derived(
  EDITABLE_ADDRESS_FIELDS.filter(
    field =>
      field === 'formattedAddress' ||
      addedFields.includes(field) ||
      locales.some(locale => {
        const value = getAddressLocale(address, locale)[field]
        return (
          Boolean(value) ||
          Object.hasOwn(address.overrides[ADDRESS_LOCALES[locale]] ?? {}, field)
        )
      }),
  ),
)
let divisionDetails = $state<{ key: string; address: FeatureAddress } | null>(null)
let divisionsLoading = $state(false)
let divisionsFailed = $state(false)
const divisionDetailsKey = $derived(
  JSON.stringify([
    address.source.address2dId,
    address.source.addressSnapshotId,
    address.source.records.meta,
  ]),
)
const divisionAddress = $derived(
  hasAddressDivisionDetails(address)
    ? address
    : divisionDetails?.key === divisionDetailsKey
      ? divisionDetails.address
      : address,
)
const divisions = $derived(getAddressDivisions(divisionAddress, getLocaleKey()))
$effect(() => {
  const selected = address
  const key = divisionDetailsKey
  if (hasAddressDivisionDetails(selected) || divisionDetails?.key === key) {
    divisionsLoading = false
    divisionsFailed = false
    return
  }
  if (!selected.source.address2dId || !selected.source.addressSnapshotId) return
  let cancelled = false
  divisionsLoading = true
  divisionsFailed = false
  // Hydrate older saved selections without editing their coordinates or corrections.
  loadGeocodedAddressUnits(selected)
    .then(result => {
      if (cancelled) return
      divisionsLoading = false
      if (!hasAddressDivisionDetails(result)) {
        divisionsFailed = true
        return
      }
      divisionDetails = { key, address: result }
    })
    .catch(() => {
      if (!cancelled) {
        divisionsLoading = false
        divisionsFailed = true
      }
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
  longitude = String(coordinates[0] ?? '')
  latitude = String(coordinates[1] ?? '')
  coordinateError = ''
})
const labels = $derived<Record<AddressField, string>>({
  formattedAddress: m.feature_address_formattedAddress(),
  buildingName: m.feature_address_buildingName(),
  buildingNumberExpression: m.feature_address_buildingNumberExpression(),
  buildingNumberFrom: m.feature_address_buildingNumberFrom(),
  buildingNumberTo: m.feature_address_buildingNumberTo(),
  buildingNumberConnector: m.feature_address_buildingNumberConnector(),
  blockExpression: m.feature_address_blockExpression(),
  blockType: m.feature_address_blockType(),
  blockRef: m.feature_address_blockRef(),
  blockTypeBeforeNumber: m.feature_address_blockTypeBeforeNumber(),
  phaseExpression: m.feature_address_phaseExpression(),
  phaseName: m.feature_address_phaseName(),
  phaseRef: m.feature_address_phaseRef(),
  premisesName: m.feature_address_premisesName(),
  streetName: m.feature_address_streetName(),
})
const units = $derived(getAddressUnits(address, getLocaleKey()))
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
</script>

<SectionHeader
  title={m.feature_address_title()}
  description={m.feature_address_subtitle()}
/>
{#snippet coordinatesControl()}
  <div
    class="flex min-h-[54px] items-center gap-3 rounded-full border border-border bg-panel px-4 py-1 text-foreground shadow-sm"
  >
    <button
      type="button"
      aria-label={m.admin__geo_lookup_address_at_location()}
      title={m.admin__geo_lookup_address_at_location()}
      disabled={!isEditing || isLoading || Boolean(coordinateError)}
      onclick={() => onLookup()}
      class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-35"
    >
      <SearchIcon class="size-4" aria-hidden="true" />
    </button>
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
            class="w-24 min-w-0 rounded-md bg-transparent py-2 text-sm tabular-nums outline-none transition-[width] focus:w-44 focus:ring-2 focus:ring-primary @max-[1100px]:focus:w-32"
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
          <span class="w-24 py-2 text-sm tabular-nums"
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
      title={m.feature_address_copy_coordinates()}
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
    class="flex min-h-[54px] items-center gap-2 rounded-full border border-border bg-panel py-1 pl-4 pr-1.5 text-foreground shadow-sm"
  >
    <input
      type="text"
      aria-label={m.feature_address_lookup()}
      placeholder={m.feature_address_lookup()}
      value={getAddressDisplay(address, getLocaleKey())}
      readonly={!isEditing}
      class="min-w-0 flex-1 rounded-md bg-transparent py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
      oninput={event =>
        onChange(
          setAddressExpression(
            address,
            getLocaleKey(),
            'formattedAddress',
            event.currentTarget.value,
          ),
        )}
      onkeydown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          const query = getAddressDisplay(address, getLocaleKey()).trim()
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
      disabled={!isEditing ||
        isLoading ||
        !getAddressDisplay(address, getLocaleKey()).trim()}
      onClick={() => onLookup(getAddressDisplay(address, getLocaleKey()).trim())}
    />
  </div>
{/snippet}
<AddressMap
  {map}
  {coordinatesControl}
  {lookupControl}
  {onLookup}
  {isEditing}
  {isLoading}
  canLookup={isEditing && !coordinateError}
  sourceId={address.matchStatus === 'resolved' && address.source.status === 'resolved'
    ? address.source.address2dId
    : null}
/>
<div class="border-b border-border px-6 pb-5 pt-10 @max-[1100px]:pt-2">
  {#if coordinateError}
    <p role="alert" class="text-sm text-error">{coordinateError}</p>
  {/if}
  <p role="status" class="text-sm text-muted-foreground">{message || status}</p>
</div>
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
{#if units.length}
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
            address3dId: selected?.inventoryId ?? null,
            address3dUnitId: selected?.value ?? null,
          },
        })
      }}
    />
  </div>
{/if}
<SectionHeader
  title={m.feature_address_corrections()}
  description={m.feature_address_corrections_help()}
/>
<div class="divide-y divide-border">
  {#each visibleFields as field (field)}
    <div class="grid gap-3 px-6 py-4 @min-[700px]:grid-cols-[10rem_1fr]">
      <div class="pt-2 text-sm font-medium">{labels[field]}</div>
      <div
        class="grid gap-4 {field === 'buildingNumberExpression'
          ? ''
          : '@min-[700px]:grid-cols-3'}"
      >
        {#each field === 'buildingNumberExpression'
          ? (['en'] as const)
          : locales as locale}
          {@const overridden = Object.hasOwn(
            address.overrides[ADDRESS_LOCALES[locale]] ?? {},
            field,
          )}
          {@const suggestions = getExpressionSuggestions(field, locale)}
          <div class="flex items-end gap-1">
            <TextInput
              name=""
              id={`address-${locale}-${field}`}
              class="min-w-0 flex-1"
              label={field === 'buildingNumberExpression'
                ? m.feature_address_shared()
                : locale === 'en'
                  ? 'EN'
                  : locale === 'zhHant'
                    ? '繁體'
                    : '简体'}
              value={field === 'formattedAddress'
                ? getAddressDisplay(address, locale)
                : String(
                    field === 'buildingNumberExpression'
                      ? (locales
                          .map(key => getAddressLocale(address, key)[field])
                          .find(Boolean) ?? '')
                      : (getAddressLocale(address, locale)[field] ?? ''),
                  )}
              placeholder="—"
              {isEditing}
              inputAttrs={{
                list: suggestions.length ? `suggest-${locale}-${field}` : undefined,
              }}
              onValueChange={value =>
                onChange(setAddressExpression(address, locale, field, value))}
            />
            {#if suggestions.length}
              <datalist id={`suggest-${locale}-${field}`}>
                {#each suggestions as suggestion}
                  <option value={suggestion}></option>
                {/each}
              </datalist>
            {/if}
            {#if isEditing && overridden}
              <Button
                text={m.feature_address_reset()}
                size="sm"
                style="ghost"
                onClick={() =>
                  onChange(setAddressExpression(address, locale, field, undefined))}
              />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>
{#if isEditing && visibleFields.length < EDITABLE_ADDRESS_FIELDS.length}
  <div class="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4">
    <span class="mr-2 text-sm text-muted-foreground"
      >{m.feature_address_add_detail()}</span
    >
    {#each EDITABLE_ADDRESS_FIELDS.filter(
      field => !visibleFields.includes(field),
    ) as field}
      <Button
        text={labels[field]}
        style="outline"
        size="sm"
        onClick={() => (addedFields = [...addedFields, field])}
      />
    {/each}
  </div>
{/if}
<SectionHeader
  title={m.feature_address_divisions()}
  description={m.feature_address_divisions_help()}
/>
<div class="grid gap-3 px-6 py-5 @min-[700px]:grid-cols-2">
  {#each divisions as division (division.id)}
    {@const Icon =
      divisionIcons[division.role as keyof typeof divisionIcons] ??
      (division.role === 'landform'
        ? divisionIcons.major_island
        : division.role === 'country'
          ? divisionIcons.sar
          : divisionIcons.area)}
    <div class="flex items-center gap-3 rounded-md border border-border px-4 py-3">
      <Icon class="size-5 shrink-0 text-base-content/60" aria-hidden="true" />
      <div class="min-w-0">
        <p class="text-xs capitalize text-muted-foreground">{division.role}</p>
        <p class="text-sm font-medium">{division.name}</p>
      </div>
    </div>
  {:else}
    <p role="status" class="text-sm text-muted-foreground">
      {divisionsLoading
        ? m.feature_address_divisions_loading()
        : divisionsFailed
          ? m.feature_address_divisions_failed()
          : hasAddressDivisionDetails(divisionAddress)
            ? m.feature_address_divisions_empty()
            : m.feature_address_divisions_unloaded()}
    </p>
  {/each}
</div>
{#if address.legacy}
  <details class="mx-6 my-6 rounded-md border border-border p-4 text-sm">
    <summary class="cursor-pointer font-medium">{m.feature_address_legacy()}</summary>
    <pre
      class="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground"
    >{JSON.stringify(address.legacy, null, 2)}</pre>
  </details>
{/if}
