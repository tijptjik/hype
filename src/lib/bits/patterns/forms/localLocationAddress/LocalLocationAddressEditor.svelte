<script lang="ts">
import { saveSharedLocationDirectoryCorrection } from '#lib/api/locationShared.remote.js'
import type { SharedCorrectionPatch } from '#lib/locations/sharedCorrection.js'
import type { LocationBrandEdit } from '#lib/locations/brandEdit.js'
import LocationBrandEditor from '../featureLocation/LocationBrandEditor.svelte'
// COMPONENTS
import LocationAccessibility from '../featureLocation/LocationAccessibility.svelte'
// SVELTE
import { onDestroy, untrack } from 'svelte'
// COMPONENTS
import FormFeatureAddress from '../formFeatureAddress/FormFeatureAddress.svelte'
import LocationLinkedFeatures from './LocationLinkedFeatures.svelte'
import LocationRelationships from '../locationRelationships/LocationRelationships.svelte'
import AddressDetails from '../formFeatureAddress/AddressDetails.svelte'
import AddressDivisions from '../formFeatureAddress/AddressDivisions.svelte'
import LocalAddressParseReview from './LocalAddressParseReview.svelte'
import LocationRecordDetails from './LocationRecordDetails.svelte'
import LocationNameFields from './LocationNameFields.svelte'
import LocationLifecycleFields from './LocationLifecycleFields.svelte'
import {
  validateLocationStatusKind,
  type LocationLifecycleSummary,
} from '#lib/locations/lifecycle.js'
import LocationKindField from './LocationKindField.svelte'
import MapPrimitive from '../formMapSection/components/MapPrimitive.svelte'
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
// API
import {
  saveLocalLocationAddress,
  searchDirectoryLocationPlaces,
} from '#lib/api/locationDirectory.remote.js'
import { discoverLocationKind } from '#lib/locations/combinedDiscovery.js'
import { LocationNamesEditSchema } from '#lib/locations/validation.js'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
import type { LocationKind } from '#lib/locations/kinds.js'
import type { LocationDiscoveryType } from '#lib/locations/kinds.js'
// DOMAIN
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { geocodeAddressCandidates } from '#lib/api/external/geocoding.js'
import {
  prepareLocalLocationAddress,
  localAddressDraft,
  localAddressContent,
} from '#lib/addresses/locationDraft.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// TYPES
import type { HeaderFormActionsState } from '#lib/context/headerState.types.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { LocationResource } from '#lib/locations/resource.js'

let {
  place,
  queryScope,
  isEditing = false,
  onEditingChange,
  onControlsChange,
  onSaved,
}: {
  place: LocationResource
  queryScope: string
  isEditing?: boolean
  onEditingChange: (editing: boolean) => void
  onControlsChange: (controls: Partial<HeaderFormActionsState>) => void
  onSaved: () => Promise<void>
} = $props()
let correctionScope = $state<'organisation' | 'shared'>(
  untrack(() => (place.canEditShared ? 'shared' : 'organisation')),
)
let sharedBrandEdit = $state<LocationBrandEdit | undefined>()
const editableFacts = $derived(
  correctionScope === 'shared' ? (place.sharedFacts ?? place.facts) : place.facts,
)
let draft = $state<FeatureAddress | null>(null)
let names = $state<Record<string, string>>({})
let lifecycle = $state<LocationLifecycleSummary>({})
let successorLocationId = $state<string | null>(null)
let initialLifecycleSignature = $state('')
let kind = $state<LocationKind>('unknown')
let expectedKind = $state<LocationKind>('unknown')
let numberMapController = $state.raw<
  import('#lib/map/controller.js').MapController | null
>(null)
let coordinates = $state<[number, number]>([0, 0])
let expectedRevisionId = $state('')
let expectedOrganisationRevision = $state<string | null>(null)
let parseSource = $state<Record<string, string> | undefined>()
let editing = $state(false)
let busy = $state(false)
let failed = $state(false)
let saved = $state(false)
type LookupCandidate = {
  id: string
  kind: 'establishment' | 'address'
  address: FeatureAddress
  names?: Record<string, string>
}
let lookupCandidates = $state<LookupCandidate[]>([])
let lookupUnavailable = $state<LocationDiscoveryType[]>([])
let lookupPartial = $state(false)
let establishmentAddressSelected = $state(false)
let lookingUp = $state(false)
let lookupFailed = $state(false)
let lookupVersion = 0
let coordinateInvalid = $state(false)
let initialSignature = $state('')
let initialAddressSignature = $state('')
let initialNamesSignature = $state('')
const lifecycleInvalid = $derived.by(() => {
  if (!editing) return false
  try {
    validateLocationStatusKind(kind, lifecycle)
    return false
  } catch {
    return true
  }
})
const namesInvalid = $derived(
  editing && !LocationNamesEditSchema.safeParse(names).success,
)
onDestroy(() => {
  lookupVersion++
})
const retainedAddress = $derived<FeatureAddress>({
  ...emptyFeatureAddress(),
  ...(place.facts
    ? {
        source: place.facts.location.address,
        coordinates: place.facts.location.geometry.coordinates,
        matchStatus: place.facts.location.address.status,
      }
    : {}),
})
// Older local records retain display text only; parse a view copy without changing saved evidence.
const presentationAddress = $derived.by(() => {
  if (retainedAddress.source.authored || retainedAddress.source.rawSource.data)
    return retainedAddress
  const preview = localAddressDraft(prepareLocalLocationAddress(retainedAddress))
  preview.source.fallbackDisplay = retainedAddress.source.fallbackDisplay
  preview.source.divisionOverrides = retainedAddress.source.divisionOverrides
  return preview
})
const address = $derived(editing && draft ? draft : presentationAddress)
const point = $derived(
  editing ? coordinates : (place.facts?.location.geometry.coordinates ?? [0, 0]),
)
const activeKind = $derived(editing ? kind : place.kind)
const kindLabel = $derived(locationKindLabel(activeKind))

/** Capture an independent editable copy and both revision fences; no source evidence is rewritten.
 * @returns Nothing; concurrent changes cannot silently replace this draft.
 */
function edit(): void {
  if (
    !place.canEditAddress ||
    place.state === 'redirect' ||
    !editableFacts ||
    !place.revisionId
  )
    return
  sharedBrandEdit = undefined
  const retained = {
    ...$state.snapshot(retainedAddress),
    source: editableFacts.location.address,
    coordinates: editableFacts.location.geometry.coordinates,
  }
  draft = localAddressDraft(prepareLocalLocationAddress(retained, retained))
  draft.divisionOverrides = {
    ...retained.source.divisionOverrides,
    ...draft.divisionOverrides,
  }
  coordinates = [...editableFacts.location.geometry.coordinates]
  kind = expectedKind = place.kind
  lifecycle = {
    operatingStatus: editableFacts.operatingStatus,
    buildingStatus: editableFacts.buildingStatus,
  }
  successorLocationId = editableFacts.successorLocationId ?? null
  initialLifecycleSignature = JSON.stringify(lifecycle) ?? ''
  names = Object.fromEntries(
    Object.entries(editableFacts.names).filter(([, name]) => name?.trim()),
  )
  if (!Object.keys(names).length)
    names = {
      [getLocaleKey() === 'zhHant'
        ? 'zh-hant'
        : getLocaleKey() === 'zhHans'
          ? 'zh-hans'
          : 'en']: '',
    }
  parseSource = undefined
  expectedRevisionId = place.revisionId
  expectedOrganisationRevision = place.organisationRevision ?? null
  editing = true
  initialSignature = JSON.stringify([
    draft,
    coordinates,
    names,
    kind,
    lifecycle,
    successorLocationId,
  ])
  initialAddressSignature = JSON.stringify(draft)
  initialNamesSignature = JSON.stringify(names)
  lookupCandidates = []
  lookupUnavailable = []
  lookupPartial = false
  establishmentAddressSelected = false
  lookupFailed = false
  saved = failed = false
}

/** Preview structured address choices without moving the Location marker or changing saved evidence.
 * @returns Resolves after the current lookup, ignoring responses after cancellation or replacement.
 */
async function lookup(query?: string): Promise<void> {
  if (!editing || busy || lookingUp) return
  const version = ++lookupVersion
  lookingUp = true
  lookupFailed = false
  try {
    const found = await discoverLocationKind<LookupCandidate>(kind, {
      address: async () => {
        const results = await geocodeAddressCandidates(
          query?.trim()
            ? { address: query.trim() }
            : { lng: coordinates[0], lat: coordinates[1] },
        )
        return {
          rows: results.flatMap((result, index) =>
            result.addressMeta.address
              ? [
                  {
                    id: `address:${result.addressMeta.address.source.address2dId ?? index}`,
                    kind: 'address' as const,
                    address: result.addressMeta.address,
                  },
                ]
              : [],
          ),
          partial: false,
          limited: results.length >= 10,
        }
      },
      establishment: async () => {
        if (!place.editingOrganisationId && !place.canEditShared)
          return { rows: [], partial: false, limited: false }
        const results = await searchDirectoryLocationPlaces({
          locationId: place.id,
          organisationId: place.editingOrganisationId ?? undefined,
          kind,
          q: query?.trim().slice(0, 200) || undefined,
          coordinates,
          locale:
            getLocaleKey() === 'zhHant'
              ? 'zh-hant'
              : getLocaleKey() === 'zhHans'
                ? 'zh-hans'
                : 'en',
        })
        return {
          ...results,
          rows: results.rows.map(row => ({
            id: `establishment:${row.id}`,
            kind: 'establishment' as const,
            names: row.facts.names,
            address: {
              ...emptyFeatureAddress(),
              source: row.facts.location.address,
              coordinates: row.facts.location.geometry.coordinates,
            },
          })),
        }
      },
    })
    if (version !== lookupVersion) return
    lookupCandidates = [
      ...new Map(found.rows.map(candidate => [candidate.id, candidate])).values(),
    ]
    lookupUnavailable = found.unavailable
    lookupPartial = found.partial
    lookupFailed = !lookupCandidates.length
  } catch {
    if (version === lookupVersion) lookupFailed = true
  } finally {
    if (version === lookupVersion) lookingUp = false
  }
}

/** Move the draft marker while discarding obsolete address previews.
 * @param next Proposed WGS84 coordinate pair. @returns Nothing; invalid coordinates remain unsaved.
 */
function moveMarker(next: number[]): void {
  coordinateInvalid =
    !next.every(Number.isFinite) || Math.abs(next[0]) > 180 || Math.abs(next[1]) > 90
  if (coordinateInvalid) return
  coordinates = [next[0], next[1]]
  lookupFailed = false
  lookupVersion++
  lookingUp = false
  lookupCandidates = []
  lookupUnavailable = []
  lookupPartial = false
}

/** Stage selected source details without asserting that an address/building identifies an establishment.
 * @param candidate Explicitly selected preview. @returns Nothing; the header Save still owns persistence.
 */
function selectLookup(candidate: LookupCandidate): void {
  const selections = draft?.divisionOverrides
  draft = localAddressDraft(
    prepareLocalLocationAddress($state.snapshot(address), candidate.address),
  )
  draft.divisionOverrides = selections
  if (candidate.kind === 'establishment' && candidate.names)
    names = { ...names, ...candidate.names }
  else if (kind === 'establishment') establishmentAddressSelected = true
  else if (kind === 'building' || kind === 'address') {
    const content = localAddressContent($state.snapshot(draft))
    const derived = Object.fromEntries(
      Object.entries(content.i18n).flatMap(([tag, fields]) => {
        const name = kind === 'building' ? fields.buildingName : fields.formattedAddress
        return name ? [[tag, name]] : []
      }),
    )
    if (Object.keys(derived).length) names = { ...names, ...derived }
  }
  if (kind === 'building')
    draft = localAddressDraft({
      ...localAddressContent($state.snapshot(draft)),
      unit: null,
      unitI18n: {},
    })
  draft.divisionOverrides = selections
  lookupCandidates = []
}
/** Save names, address and marker atomically; linked Features retain their independent adoption decisions.
 * @returns Resolves after refreshing the accepted Location, or retains the draft on failure.
 */
async function save(): Promise<void> {
  if (
    busy ||
    lookingUp ||
    coordinateInvalid ||
    namesInvalid ||
    lifecycleInvalid ||
    !draft
  )
    return
  busy = true
  failed = false
  try {
    if (correctionScope === 'shared') {
      if (!place.canEditShared || !editableFacts)
        throw new Error('Shared editing unavailable')
      const patch: SharedCorrectionPatch = {}
      if (JSON.stringify(names) !== initialNamesSignature)
        patch.names = { mode: 'override', value: $state.snapshot(names) }
      if (
        JSON.stringify(draft) !== initialAddressSignature ||
        JSON.stringify(coordinates) !==
          JSON.stringify(editableFacts.location.geometry.coordinates)
      ) {
        const address =
          JSON.stringify(draft) !== initialAddressSignature
            ? {
                status: 'unresolved' as const,
                address2dId: null,
                address3dId: null,
                address3dUnitId: null,
                snapshotId: null,
                rawSource: {},
                fallbackDisplay: {},
                authored: localAddressContent($state.snapshot(draft)),
                divisionOverrides: draft.divisionOverrides,
              }
            : editableFacts.location.address
        patch.location = {
          mode: 'override',
          value: {
            geometry: { type: 'Point', coordinates: $state.snapshot(coordinates) },
            address,
          },
        }
      }
      for (const field of ['operatingStatus', 'buildingStatus'] as const)
        if (lifecycle[field] !== editableFacts[field])
          patch[field] = { mode: 'override', value: lifecycle[field] ?? null }
      if (successorLocationId !== (editableFacts.successorLocationId ?? null))
        patch.successorLocationId = { mode: 'override', value: successorLocationId }
      if (sharedBrandEdit) patch.brands = sharedBrandEdit.choice
      if (Object.keys(patch).length)
        await saveSharedLocationDirectoryCorrection({
          locationId: place.id,
          sourceRevisionId: expectedRevisionId,
          expectedRevision: place.sharedRevision ?? null,
          patch,
        })
    } else
      await saveLocalLocationAddress({
        locationId: place.id,
        organisationId: place.editingOrganisationId ?? undefined,
        expectedOrganisationRevision,
        expectedRevisionId,
        kind: kind !== expectedKind ? kind : undefined,
        expectedKind,
        ...(JSON.stringify(lifecycle) !== initialLifecycleSignature
          ? $state.snapshot(lifecycle)
          : {}),
        successorLocationId:
          successorLocationId !== (place.facts?.successorLocationId ?? null)
            ? successorLocationId
            : undefined,
        names:
          JSON.stringify(names) !== initialNamesSignature
            ? $state.snapshot(names)
            : undefined,
        address:
          JSON.stringify(draft) !== initialAddressSignature
            ? localAddressContent($state.snapshot(draft))
            : undefined,
        divisionOverrides:
          JSON.stringify(draft) !== initialAddressSignature
            ? draft.divisionOverrides
            : undefined,
        coordinates,
        parseSource,
      })
    await onSaved()
    editing = false
    onEditingChange(false)
    saved = true
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
const title = $derived(
  place.facts?.names[
    getLocaleKey() === 'zhHant'
      ? 'zh-hant'
      : getLocaleKey() === 'zhHans'
        ? 'zh-hans'
        : 'en'
  ] ||
    place.facts?.names.en ||
    Object.values(place.facts?.names ?? {}).find(Boolean) ||
    place.id,
)

/** Discard this edit and invalidate outstanding lookup responses.
 * @returns Nothing; accepted Location facts remain unchanged.
 */
function cancel(): void {
  editing = false
  draft = null
  names = {}
  failed = false
  lookupVersion++
  lookingUp = false
  coordinateInvalid = false
  lookupCandidates = []
  onEditingChange(false)
  lookupUnavailable = []
  lookupPartial = false
  establishmentAddressSelected = false
}
$effect(() => {
  if (isEditing && !editing) untrack(edit)
  else if (!isEditing && editing && !busy) untrack(cancel)
})
$effect(() => {
  onControlsChange({
    dirty:
      editing &&
      (Boolean(sharedBrandEdit) ||
        JSON.stringify([
          draft,
          coordinates,
          names,
          kind,
          lifecycle,
          successorLocationId,
        ]) !== initialSignature),
    isSubmitting: busy || lookingUp,
    hasIssues: coordinateInvalid || namesInvalid || lifecycleInvalid,
    canEdit: Boolean(place.canEditAddress && place.state !== 'redirect' && place.facts),
    canPublish: false,
    showPublishAction: false,
    showDeleteAction: false,
    submit: () => {
      void save()
    },
    reset: cancel,
  })
})
</script>

{#if place.facts}
  <FormFeatureAddress
    locationKind={activeKind}
    {address}
    coordinates={point}
    isEditing={editing}
    isLoading={busy || lookingUp}
    fixedMap={true}
    hideDetails={true}
    showLookup={editing}
    show3dAddressOptions={activeKind !== 'building'}
    onCoordinateChange={moveMarker}
    onCoordinateValidityChange={valid => (coordinateInvalid = !valid)}
    onLookup={lookup}
    onChange={next => (draft = next)}
    onSelectCandidate={candidate => {
      const selections = draft?.divisionOverrides
      draft = localAddressDraft(
        prepareLocalLocationAddress($state.snapshot(address), candidate),
      )
      draft.divisionOverrides = selections
    }}
  >
    {#snippet map()}
      <MapPrimitive
        onMapReady={controller => (numberMapController = controller)}
        coordinates={point}
        addressMeta={{ address }}
        draggable={editing && !busy}
        onCoordinateChange={moveMarker}
      />
    {/snippet}
    {#snippet locationControl()}
      <div
        class="text-primary flex min-w-0 items-center gap-2"
        data-location-record
        data-tooltip={kindLabel}
      >
        <LocationIcon kind={activeKind} class="size-6 shrink-0" />
        <span class="truncate text-sm font-semibold">{title}</span>
        <span class="text-muted-foreground hidden shrink-0 text-xs @min-[900px]:inline"
          >{kindLabel}</span
        >
      </div>
    {/snippet}
    {#snippet locationContent()}
      <div class="grid gap-6 px-6 py-6 @min-[900px]:grid-cols-[15rem_minmax(0,1fr)]">
        <LocationRecordDetails {place} isEditing={editing} />
        <div
          class="@min-[900px]:border-border min-w-0 space-y-6 @min-[900px]:border-l @min-[900px]:pl-6"
        >
          {#if editing}
            <section
              class="border-border space-y-5 border-b pb-6"
              aria-label={m.location_record_identity()}
            >
              <h2 class="text-lg font-semibold">{m.location_record_identity()}</h2>
              {#if place.canEditShared}
                <label class="grid gap-1 text-sm"
                  >Correction scope
                  <select
                    class="border-border bg-background rounded border p-2"
                    value={correctionScope}
                    disabled={busy}
                    onchange={event => {
                      correctionScope =
                        event.currentTarget.value === 'shared'
                          ? 'shared'
                          : 'organisation'
                      edit()
                    }}
                  >
                    <option value="shared">Hype shared correction</option>
                    {#if place.editingOrganisationId}
                      <option value="organisation">Organisation override</option>
                    {/if}
                  </select>
                </label>
                {#if correctionScope === 'shared'}
                  <p class="text-muted-foreground text-sm">
                    These corrections are shared across Hype. Upstream evidence remains
                    in Location history.
                  </p>
                {/if}
              {/if}
              <div class="max-w-72">
                <LocationKindField
                  value={kind}
                  disabled={busy ||
                    correctionScope === 'shared' ||
                    place.ssId !== null ||
                    place.ownerOrganisationId !== place.editingOrganisationId}
                  onChange={next => {
                    kind = next
                    lifecycle = {
                      operatingStatus:
                        next === 'establishment' ? lifecycle.operatingStatus : null,
                      buildingStatus:
                        next === 'building' ? lifecycle.buildingStatus : null,
                    }
                    lookupVersion++
                    lookingUp = false
                    lookupCandidates = []
                    lookupUnavailable = []
                    lookupPartial = false
                    establishmentAddressSelected = false
                    if (next === 'building' && draft) {
                      const selections = draft.divisionOverrides
                      draft = localAddressDraft({
                        ...localAddressContent($state.snapshot(draft)),
                        unit: null,
                        unitI18n: {},
                      })
                      draft.divisionOverrides = selections
                    }
                  }}
                />
              </div>
              <LocationNameFields
                {names}
                disabled={busy}
                onChange={next => (names = next)}
              />
              {#if place.canEditShared && correctionScope === 'shared'}
                <LocationBrandEditor
                  association={{
                    version: place.sharedRevision ?? expectedRevisionId,
                    brandMode: 'inherit',
                    effective: { brands: editableFacts?.brands ?? [] },
                  }}
                  edit={sharedBrandEdit}
                  isEditing={!busy}
                  onChange={value => (sharedBrandEdit = value)}
                />
              {/if}
              {#if establishmentAddressSelected}
                <p role="status" class="text-muted-foreground text-sm">
                  {m.location_establishment_address_help()}
                </p>
              {/if}
            </section>
          {/if}
          <LocationLifecycleFields
            value={editing ? lifecycle : (place.facts ?? undefined)}
            successorLocationId={editing
              ? successorLocationId
              : place.facts?.successorLocationId}
            onSuccessorChange={next => (successorLocationId = next)}
            kind={activeKind}
            isEditing={editing}
            disabled={busy}
            onChange={next => (lifecycle = next)}
          />
          {#if lifecycleInvalid}
            <p role="alert" class="text-destructive text-sm">
              {m.location_lifecycle_invalid()}
            </p>
          {/if}
          {#if place.facts}
            {#if coordinateInvalid}
              <p role="alert" class="text-destructive text-sm">
                {m.feature_address_coordinates_invalid()}
              </p>
            {/if}
            {#if editing}
              {#if lookupPartial && !lookupUnavailable.length}
                <p role="status" class="text-muted-foreground text-sm">
                  {m.feature_location_search_partial()}
                </p>
              {/if}
              {#if lookupUnavailable.length}
                <p role="status" class="text-muted-foreground text-sm">
                  {m.location_search_incomplete()}:
                  {lookupUnavailable.map(type => locationKindLabel(type)).join(', ')}.
                </p>
              {/if}
              {#if lookupFailed}
                <p role="alert" class="text-destructive text-sm">
                  {m.feature_address_failed()}
                </p>
              {/if}
              {#each lookupCandidates as candidate (candidate.id)}
                <button
                  type="button"
                  class="border-border hover:text-primary block w-full border-b py-3 text-left text-sm"
                  onclick={() => selectLookup(candidate)}
                >
                  <span
                    class="text-muted-foreground mb-1 flex items-center gap-2 text-xs"
                    ><LocationIcon kind={candidate.kind} class="size-4" />
                    {locationKindLabel(candidate.kind)}</span
                  >
                  {#if candidate.names}
                    <span class="block font-medium"
                      >{candidate.names[
                        getLocaleKey() === 'en'
                          ? 'en'
                          : getLocaleKey() === 'zhHant'
                            ? 'zh-hant'
                            : 'zh-hans'
                      ] ||
                        candidate.names.en ||
                        Object.values(candidate.names)[0]}</span
                    >
                  {/if}
                  {getAddressDisplay(candidate.address, getLocaleKey())}
                  <span class="text-muted-foreground mt-1 block text-xs"
                    >{candidate.kind === 'address'
                      ? m.location_use_address()
                      : m.location_use_preview_details()}</span
                  >
                </button>
              {/each}
            {/if}
            <fieldset disabled={busy} class="min-w-0 space-y-6">
              <AddressDetails
                suggestionKey={JSON.stringify([place.id, point])}
                onSuggestStreetNumber={async () =>
                  (await numberMapController?.getStreetNumberAt?.([
                    point[0],
                    point[1],
                  ])) ?? null}
                locationKind={activeKind}
                accessibilityLocationId={place.id}
                {address}
                isEditing={editing}
                showAccessHints={false}
                show3dAddressOptions={activeKind !== 'building'}
                onChange={next => (draft = next)}
              />
              <AddressDivisions
                {address}
                coordinates={point}
                isEditing={editing}
                onChange={next => (draft = next)}
              />
              {#if editing && draft}
                {@const content = localAddressContent($state.snapshot(draft))}
                <details class="border-border border-t pt-4">
                  <summary class="text-muted-foreground cursor-pointer text-sm">
                    {m.location_address_parse()}
                  </summary>
                  <div class="pt-3">
                    <LocalAddressParseReview
                      value={content}
                      disabled={busy}
                      onParsed={source => (parseSource = source)}
                      onValueChange={next => {
                        const selections = draft?.divisionOverrides
                        draft = localAddressDraft(next)
                        draft.divisionOverrides = selections
                      }}
                    />
                  </div>
                </details>
              {/if}
            </fieldset>
          {/if}
          {#if saved}
            <p role="status" class="text-muted-foreground text-sm">
              {m.location_address_saved()}
            </p>
          {/if}
          {#if failed}
            <p role="alert" class="text-destructive text-sm">
              {m.location_address_failed()}
            </p>
          {/if}
          <LocationRelationships
            locationId={place.id}
            kind={place.kind}
            organisationId={place.editingOrganisationId ?? null}
            {queryScope}
            canEdit={editing && Boolean(place.canEditAddress)}
          />
          <LocationLinkedFeatures
            locationId={place.id}
            organisationId={place.editingOrganisationId ?? undefined}
            {queryScope}
          />
          <p class="text-muted-foreground text-sm leading-relaxed">
            {m.location_directory_detail_help()}
          </p>
        </div>
      </div>
    {/snippet}
  </FormFeatureAddress>
{:else}
  <div class="space-y-6 px-6 py-6">
    <LocationRecordDetails {place} />
    <LocationAccessibility locationId={place.id} />
    <LocationRelationships
      locationId={place.id}
      kind={place.kind}
      organisationId={place.editingOrganisationId ?? null}
      {queryScope}
      canEdit={editing && Boolean(place.canEditAddress)}
    />
    <LocationLinkedFeatures
      locationId={place.id}
      organisationId={place.editingOrganisationId ?? undefined}
      {queryScope}
    />
  </div>
{/if}
