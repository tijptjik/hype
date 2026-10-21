<script lang="ts">
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
// API
import {
  createLocalLocation,
  getLocalLocationCreationAccess,
} from '#lib/api/location.remote.js'
// GEOCODING
import { geocodeAddressCandidates } from '#lib/api/external/geocoding.js'
import { prepareLocalLocationAddress } from '#lib/addresses/locationDraft.js'
import {
  ADDRESS_LOCALES,
  getAddressDisplay,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
// DOMAIN
import LocalLocationAddressFields from '#lib/bits/patterns/forms/localLocationAddress/LocalLocationAddressFields.svelte'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
// TYPES
import type { LocationFacts } from '#lib/locations/model.js'

let {
  open = $bindable(false),
  hideTrigger = false,
  initialAddress,
  selectedAddress,
  lookupRequest,
  initialName = '',
  onCancel,
  projectId,
  coordinates,
  disabled,
  onCreated,
}: {
  open?: boolean
  hideTrigger?: boolean
  initialAddress?: FeatureAddress
  selectedAddress?: FeatureAddress
  lookupRequest?: { query: string; revision: number }
  initialName?: string
  onCancel?: () => void
  projectId: string
  coordinates: number[]
  disabled: boolean
  onCreated: (selection: {
    locationId: string
    revisionId: string
    facts: LocationFacts
  }) => void
} = $props()
let allowed = $state(false)
// Offer creation only after checking the owning Organisation; writes reauthorize independently.
$effect(() => {
  const access = getLocalLocationCreationAccess({ projectId })
  let cancelled = false
  allowed = false
  void access
    .refresh()
    .then(() => access)
    .then(result => {
      if (!cancelled) allowed = result.allowed
    })
    .catch(() => {
      if (!cancelled) allowed = false
    })
  return () => {
    cancelled = true
  }
})
// The initial name belongs to this creation draft, not subsequent parent edits.
// svelte-ignore state_referenced_locally
let name = $state(initialName)
let address = $state(createLocalLocationAddress())
let parseSource = $state<Record<string, string> | undefined>()
let locationState = $state<'manual' | 'unresolved'>('unresolved')
let busy = $state(false)
let failed = $state(false)
let preparing = $state(false)
let geocodeFailed = $state(false)
let geocodeEmpty = $state(false)
let geocodeChoices = $state<FeatureAddress[]>([])
let preparedRevision = -1
$effect(() => {
  if (!open || !initialAddress) return
  const revision = lookupRequest?.revision ?? 0
  if (preparedRevision === revision) return
  preparedRevision = revision
  const original = initialAddress
  const query = lookupRequest?.query ?? getAddressDisplay(original, getLocaleKey())
  address = prepareLocalLocationAddress(original)
  parseSource = Object.fromEntries(
    Object.entries(ADDRESS_LOCALES).map(([locale, tag]) => [
      tag,
      getAddressDisplay(original, locale as keyof typeof ADDRESS_LOCALES),
    ]),
  )
  if (selectedAddress && !lookupRequest) {
    address = prepareLocalLocationAddress(original, selectedAddress)
    return
  }
  if (!query.trim()) return
  let cancelled = false
  preparing = true
  geocodeFailed = false
  geocodeEmpty = false
  void geocodeAddressCandidates({ address: query })
    .then(results => {
      if (cancelled) return
      geocodeChoices = results.flatMap(row =>
        row.addressMeta.address ? [row.addressMeta.address] : [],
      )
      geocodeEmpty = geocodeChoices.length === 0
      // Only a unique resolved match can seed the proposal automatically.
      if (geocodeChoices.length === 1 && geocodeChoices[0].matchStatus === 'resolved') {
        address = prepareLocalLocationAddress(original, geocodeChoices[0])
        geocodeChoices = []
      }
    })
    .catch(() => {
      if (!cancelled) geocodeFailed = true
    })
    .finally(() => {
      if (!cancelled) preparing = false
    })
  return () => {
    cancelled = true
  }
})
const kinds = $derived([
  { value: 'unresolved', label: m.feature_location_unresolved_kind() },
  { value: 'manual', label: m.feature_location_manual_kind() },
])

/** Create a local baseline with explicit sharing consent before the separate link action.
 * @param sharingPreference Permission for future reconciliation, never immediate publication.
 * @returns Nothing; emits the created revision for explicit association.
 */
async function create(sharingPreference: 'private' | 'allow-sharing'): Promise<void> {
  if (!allowed || busy || disabled || !name.trim()) return
  busy = true
  failed = false
  try {
    const key = getLocaleKey()
    const locale = key === 'zhHant' ? 'zh-hant' : key === 'zhHans' ? 'zh-hans' : 'en'
    const input = LocalLocationInputSchema.parse({
      state: locationState,
      sharingPreference,
      parseSource,
      facts: {
        names: { [locale]: name.trim() },
        phoneNumber: [],
        brands: [],
        location: {
          geometry: { type: 'Point', coordinates },
          address: {
            status: 'unresolved',
            address2dId: null,
            address3dId: null,
            address3dUnitId: null,
            addressSnapshotId: null,
            records: {},
            fallbackDisplay: {},
            authored: address,
          },
        },
      },
    })
    const identity = await createLocalLocation({ projectId, ...input })
    onCreated({ ...identity, facts: input.facts })
    open = false
    name = ''
    address = createLocalLocationAddress()
    parseSource = undefined
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

{#if allowed}
  <div class="space-y-4 rounded-xl border border-border p-4" data-create-location-form>
    {#if !hideTrigger}
      <Button
        type="button"
        text={m.feature_location_create_local()}
        onClick={() => (open = !open)}
        disabled={busy || disabled || preparing}
      />
    {/if}
    {#if open}
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base font-semibold">{m.feature_location_create()}</h2>
        {#if onCancel}
          <Button
            text={m.feature_location_change_cancel()}
            size="sm"
            style="ghost"
            onClick={onCancel}
          />
        {/if}
      </div>
      {#if preparing}
        <p role="status" class="text-sm text-muted-foreground">
          {m.feature_location_geocoding()}
        </p>
      {/if}
      {#if geocodeFailed}
        <p role="alert" class="text-sm text-error">{m.feature_address_failed()}</p>
      {/if}
      {#if geocodeEmpty}
        <p role="status" class="text-sm text-muted-foreground">
          {m.feature_address_no_match()}
        </p>
      {/if}
      {#if geocodeChoices.length}
        <p class="text-sm text-muted-foreground">{m.feature_address_choose_result()}</p>
        {#each geocodeChoices as choice}
          <button
            type="button"
            class="w-full rounded-lg border border-border p-3 text-left text-sm hover:bg-primary/5"
            onclick={() => {
              if (initialAddress)
                address = prepareLocalLocationAddress(initialAddress, choice)
              geocodeChoices = []
            }}
          >
            {getAddressDisplay(choice, getLocaleKey())}
          </button>
        {/each}
      {/if}
      <p class="text-sm text-muted-foreground">{m.feature_location_create_help()}</p>
      <SelectField
        id="local-location-kind"
        label={m.feature_location_kind()}
        value={locationState}
        items={kinds}
        disabled={busy || disabled || preparing}
        onValueChange={value => {
          if (value === 'manual' || value === 'unresolved') locationState = value
        }}
      />
      <TextInput
        name=""
        id="local-location-name"
        label={m.feature_location_name()}
        bind:value={name}
        inputAttrs={{
          onkeydown: (event: KeyboardEvent) => {
            if (event.key === 'Enter') event.preventDefault()
          },
        }}
        disabled={busy || disabled || preparing}
      />
      <LocalLocationAddressFields
        bind:value={address}
        disabled={busy || disabled || preparing}
        onParsed={source => {
          parseSource = source
        }}
      />
      <p class="text-sm text-muted-foreground">
        {m.feature_location_local_coordinates()} {coordinates.join(', ')}
      </p>
      <p class="text-sm text-muted-foreground">{m.feature_location_sharing_help()}</p>
      <div class="flex flex-wrap gap-2">
        <Button
          type="button"
          text={m.feature_location_create_share()}
          onClick={() => create('allow-sharing')}
          disabled={busy || disabled || preparing || !name.trim()}
        />
        <Button
          type="button"
          style="outline"
          text={m.feature_location_create_private()}
          onClick={() => create('private')}
          disabled={busy || disabled || preparing || !name.trim()}
        />
      </div>
      {#if failed}
        <p role="alert" class="text-sm text-destructive">
          {m.feature_location_failed()}
        </p>
      {/if}
    {/if}
  </div>
{/if}
