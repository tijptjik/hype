<script lang="ts">
let reviewForm: HTMLFormElement

import IdentityCataloguePicker from '../identityCatalogue/IdentityCataloguePicker.svelte'
import { saveSharedLocationDirectoryCorrection } from '#lib/api/locationShared.remote.js'
import type { SharedCorrectionPatch } from '#lib/locations/sharedCorrection.js'
import type { LocationBrandEdit } from '#lib/locations/brandEdit.js'
import LocationBrandEditor from '../featureLocation/LocationBrandEditor.svelte'
// COMPONENTS
import Tabs from '#lib/bits/core/tabs/Tabs.svelte'
import CommunityCurationLocks from './CommunityCurationLocks.svelte'
import LocationCommunications from '../featureLocation/LocationCommunications.svelte'
import { UNKNOWN_ACCESSIBILITY } from '#lib/locations/accessibility.js'
import type { LocationProfileEdit } from '#lib/locations/profileEdit.js'
import LocationAccessibility from '../featureLocation/LocationAccessibility.svelte'
// SVELTE
import { onDestroy, untrack } from 'svelte'
// COMPONENTS
import FormFeatureAddress from '../formFeatureAddress/FormFeatureAddress.svelte'
import LocationRelationships from '../locationRelationships/LocationRelationships.svelte'
import AddressDetails from '../formFeatureAddress/AddressDetails.svelte'
import AddressDivisions from '../formFeatureAddress/AddressDivisions.svelte'
import LocalAddressParseReview from './LocalAddressParseReview.svelte'
import LocationRecordDetails from './LocationRecordDetails.svelte'
import LocationLocaleField from './LocationLocaleField.svelte'
import { TextInput } from '#lib/bits/custom/form/index.js'
import BuildingUnnamedField from './BuildingUnnamedField.svelte'
import DraftLocationNameFields from '../featureLocation/DraftLocationNameFields.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import { contentLocaleOptions } from '../contentLocaleDefaults/contentLocaleOptions.js'
import type { ProfileLocaleState } from '../featureLocation/profileLocales.js'
import LocationLifecycleFields from './LocationLifecycleFields.svelte'
import { lifecycleLabel } from '#lib/locations/lifecycle.i18n.js'
import {
  lifecycleStatus,
  validateLocationStatusKind,
  type LocationLifecycleSummary,
} from '#lib/locations/lifecycle.js'
import LocationKindField from './LocationKindField.svelte'
import MapPrimitive from '../formMapSection/components/MapPrimitive.svelte'
import LocationIndoorMap from './LocationIndoorMap.svelte'
import ExpandableMap from '#lib/bits/patterns/maps/ExpandableMap.svelte'
import LocationAvatar from '#lib/bits/custom/locationIcon/LocationAvatar.svelte'
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
// API
import {
  getCommunityCurationLocks,
  setCommunityCurationLocks,
} from '#lib/api/locationCurationLocks.remote.js'
import {
  saveLocalLocationAddress,
  searchDirectoryLocationPlaces,
} from '#lib/api/locationDirectory.remote.js'
import { discoverLocationKind } from '#lib/locations/combinedDiscovery.js'
import { locationNamesEditSchema } from '#lib/locations/validation.js'
import { buildingNameLabel, locationKindLabel } from '#lib/locations/kinds.i18n.js'
import { facilitySymbol } from '#lib/indoor/facilities.js'
import { canonicalFacilityLabel } from '#lib/indoor/facilityLabels.js'
import type { LocationKind } from '#lib/locations/kinds.js'
import type { LocationDiscoveryType } from '#lib/locations/kinds.js'
// DOMAIN
import { buildingPartDisplay } from '#lib/locations/buildingPartDisplay.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { geocodeAddressCandidates } from '#lib/api/external/geocoding.js'
import {
  applyLocalAddressParse,
  prepareLocalLocationAddress,
  localAddressDraft,
  localAddressContent,
  localAddressDisplayOverrides,
} from '#lib/addresses/locationDraft.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// TYPES
import type { CurationLockField } from '#lib/locations/curationLocks.js'
import type { HeaderFormActionsState } from '#lib/context/headerState.types.js'
import type { AddressParseResult } from '@saanseoi/address'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { LocationResource } from '#lib/locations/resource.js'

let {
  place: sourcePlace,
  queryScope,
  isEditing = false,
  // Header facets retain the parent-owned draft across Profile and Relationships.
  recordView = 'core',
  onEditingChange,
  onControlsChange,
  onSaved,
}: {
  place: LocationResource
  queryScope: string
  recordView?: string
  isEditing?: boolean
  onEditingChange: (editing: boolean) => void
  onControlsChange: (controls: Partial<HeaderFormActionsState>) => void
  onSaved: () => Promise<void>
} = $props()
const communityRecord = $derived(['linked', 'unresolved'].includes(sourcePlace.state))
// The standalone record displays community facts, never an Organisation's consuming overrides.
const place = $derived(
  communityRecord && sourcePlace.sharedFacts
    ? { ...sourcePlace, facts: sourcePlace.sharedFacts, organisationRevision: null }
    : sourcePlace,
)
const canEditRecord = $derived(
  Boolean(place.canEditAddress && (!communityRecord || place.canEditShared)),
)
/** Disable closed community fields on the standalone Location record.
 * @param field Canonical curation field. @returns Whether this community field is locked.
 */
function communityClosed(field: CurationLockField): boolean {
  return communityRecord && place.communityLocks?.openFields[field] === false
}
let branch = $state<Record<string, string>>({})
let format = $state<Record<string, string>>({})
let branchId = $state('')
let profileValues = $state<LocationProfileEdit['values']>({})
let brandLink = $state<string | null>(null),
  groupLink = $state<string | null>(null)
let changedLinks = $state<{ brandId?: boolean; groupId?: boolean }>({})
let sharedBrandEdit = $state<LocationBrandEdit | undefined>()
const editableFacts = $derived(
  communityRecord ? (place.sharedFacts ?? place.facts) : place.facts,
)
let draft = $state<FeatureAddress | null>(null)
let names = $state<Record<string, string>>({})
let localeState = $state<ProfileLocaleState>({
  selectedLocales: normalizeContentLocales([
    getLocaleKey(),
    'en',
    'zh-Hant',
    'zh-Hans',
  ]),
  visibleLocales: normalizeContentLocales([getLocaleKey(), 'en', 'zh-Hant', 'zh-Hans']),
  expanded: false,
})
let lifecycle = $state<LocationLifecycleSummary>({})
let successorLocationId = $state<string | null>(null)
let initialLifecycleSignature = $state('')
let kind = $state<LocationKind>('unknown')
let unnamedChoice = $state(false)
const hasDraftName = $derived(Object.values(names).some(value => value.trim()))
const confirmedUnnamed = $derived(kind === 'building' && !hasDraftName && unnamedChoice)
let expectedKind = $state<LocationKind>('unknown')
let numberMapController = $state.raw<
  import('#lib/map/controller.js').MapController | null
>(null)
let coordinates = $state<[number, number]>([0, 0])
let expectedRevisionId = $state('')
let expectedOrganisationRevision = $state<string | null>(null)
let parseReview = $state.raw<AddressParseResult | undefined>()
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
const editedNames = $derived(locationNamesEditSchema(kind).safeParse(names))
onDestroy(() => {
  lookupVersion++
  onControlsChange({ content: null })
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
  // Containment provides display text, not a street-address parsing candidate.
  if (place.kind === 'building_part' && place.parentLocation)
    return {
      ...retainedAddress,
      source: {
        ...retainedAddress.source,
        fallbackDisplay: buildingPartDisplay(place),
      },
    }
  if (retainedAddress.source.authored || retainedAddress.source.rawSource.data)
    return retainedAddress
  const preview = localAddressDraft(prepareLocalLocationAddress(retainedAddress))
  preview.source.fallbackDisplay = buildingPartDisplay(place)
  preview.source.divisionOverrides = retainedAddress.source.divisionOverrides
  return preview
})
const address = $derived(editing && draft ? draft : presentationAddress)
const point = $derived(
  editing ? coordinates : (place.facts?.location.geometry.coordinates ?? [0, 0]),
)
const activeKind = $derived(editing ? kind : place.kind)
const kindLabel = $derived(
  activeKind === 'building_part' && place.indoorSource?.category
    ? canonicalFacilityLabel(facilitySymbol(place.indoorSource.category).label)
    : locationKindLabel(activeKind),
)
const status = $derived(lifecycleStatus(editing ? lifecycle : place.facts))
/** Capture an independent editable copy and both revision fences; no source evidence is rewritten.
 * @returns Nothing; concurrent changes cannot silently replace this draft.
 */
function edit(): void {
  if (
    !canEditRecord ||
    place.state === 'redirect' ||
    !editableFacts ||
    !place.revisionId
  )
    return
  branch = structuredClone(editableFacts?.branch ?? {})
  format = structuredClone(editableFacts?.format ?? {})
  branchId = editableFacts?.branchId ?? ''
  brandLink = editableFacts?.brandId ?? null
  groupLink = editableFacts?.groupId ?? null
  changedLinks = {}
  sharedBrandEdit = undefined
  profileValues = {}
  const retained = {
    ...$state.snapshot(retainedAddress),
    source: editableFacts.location.address,
    coordinates: editableFacts.location.geometry.coordinates,
  }
  draft = localAddressDraft(prepareLocalLocationAddress(retained, retained))
  // Restore explicit complete labels as editable overrides rather than recomposing them.
  for (const [tag, label] of Object.entries(retained.source.displayOverrides ?? {}))
    draft.overrides[tag] = { formattedAddress: label }
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
  unnamedChoice = editableFacts.confirmedUnnamed === true
  parseReview = undefined
  expectedRevisionId = place.revisionId
  expectedOrganisationRevision = place.organisationRevision ?? null
  editing = true
  initialSignature = JSON.stringify([
    draft,
    coordinates,
    names,
    confirmedUnnamed,
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
  if (communityClosed('location.geometry')) return
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
    !canEditRecord ||
    busy ||
    lookingUp ||
    coordinateInvalid ||
    !editedNames.success ||
    lifecycleInvalid ||
    !draft
  )
    return
  busy = true
  failed = false
  try {
    const namingChange =
      confirmedUnnamed !== Boolean(editableFacts?.confirmedUnnamed)
        ? confirmedUnnamed
        : undefined
    if (communityRecord) {
      if (!place.canEditShared || !editableFacts)
        throw new Error('Shared editing unavailable')
      const patch: SharedCorrectionPatch = {}
      if (namingChange !== undefined)
        patch.confirmedUnnamed = { mode: 'override', value: namingChange }
      if (JSON.stringify(names) !== initialNamesSignature)
        patch.names = { mode: 'override', value: editedNames.data }
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
                displayOverrides: localAddressDisplayOverrides($state.snapshot(draft)),
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
      if (JSON.stringify(branch) !== JSON.stringify(editableFacts?.branch ?? {}))
        patch.branch = { mode: 'override', value: branch }
      if (JSON.stringify(format) !== JSON.stringify(editableFacts?.format ?? {}))
        patch.format = { mode: 'override', value: $state.snapshot(format) }
      for (const field of [
        'phoneNumber',
        'websites',
        'socials',
        'accessibility',
      ] as const) {
        const value = profileValues[field]
        if (value !== undefined)
          Object.assign(patch, { [field]: { mode: 'override', value } })
      }
      if (sharedBrandEdit) patch.brands = sharedBrandEdit.choice
      if (changedLinks.brandId)
        patch.brandId = brandLink
          ? { mode: 'override', value: brandLink }
          : { mode: 'inherit' }
      if (changedLinks.groupId)
        patch.groupId = groupLink
          ? { mode: 'override', value: groupLink }
          : { mode: 'inherit' }
      if (Object.keys(patch).length)
        await saveSharedLocationDirectoryCorrection({
          locationId: place.id,
          organisationId: place.editingOrganisationId ?? undefined,
          sourceRevisionId: expectedRevisionId,
          expectedDraftVersion: place.draftVersion ?? undefined,
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
        confirmedUnnamed: namingChange,
        ...(JSON.stringify(lifecycle) !== initialLifecycleSignature
          ? $state.snapshot(lifecycle)
          : {}),
        successorLocationId:
          successorLocationId !== (place.facts?.successorLocationId ?? null)
            ? successorLocationId
            : undefined,
        branch:
          JSON.stringify(branch) !== JSON.stringify(editableFacts?.branch ?? {})
            ? $state.snapshot(branch)
            : undefined,
        format:
          JSON.stringify(format) !== JSON.stringify(editableFacts?.format ?? {})
            ? $state.snapshot(format)
            : undefined,
        branchId: branchId !== (editableFacts?.branchId ?? '') ? branchId : undefined,
        names:
          JSON.stringify(names) !== initialNamesSignature
            ? editedNames.data
            : undefined,
        address:
          JSON.stringify(draft) !== initialAddressSignature
            ? localAddressContent($state.snapshot(draft))
            : undefined,
        displayOverrides:
          JSON.stringify(draft) !== initialAddressSignature
            ? localAddressDisplayOverrides($state.snapshot(draft))
            : undefined,
        divisionOverrides:
          JSON.stringify(draft) !== initialAddressSignature
            ? draft.divisionOverrides
            : undefined,
        coordinates,
        parseReview,
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
  activeKind === 'building'
    ? buildingNameLabel(
        editing ? names : (place.facts?.names ?? {}),
        editing ? confirmedUnnamed : place.facts?.confirmedUnnamed,
      )
    : place.facts?.names[
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

// Keep every stored language reachable from the shared names/address toolbar.
const contentLocales = $derived(
  normalizeContentLocales([
    ...Object.keys(editing ? names : (place.facts?.names ?? {})),
    ...Object.keys(address.overrides),
    ...Object.keys(address.accessHints ?? {}),
    ...Object.keys(
      (
        address.association?.content ??
        address.canonical?.content ??
        address.source.canonical?.content ??
        address.source.authored
      )?.i18n ?? {},
    ),
  ]),
)
const selectedLocales = $derived(
  normalizeContentLocales([...localeState.selectedLocales, ...contentLocales]),
)
const editorLocaleState = $derived({
  ...localeState,
  selectedLocales,
  visibleLocales: [
    ...localeState.visibleLocales,
    ...selectedLocales.filter(tag => !localeState.selectedLocales.includes(tag)),
  ],
})

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
      (Object.keys(profileValues).length > 0 ||
        Boolean(sharedBrandEdit) ||
        Object.keys(changedLinks).length > 0 ||
        JSON.stringify(branch) !== JSON.stringify(editableFacts?.branch ?? {}) ||
        JSON.stringify(format) !== JSON.stringify(editableFacts?.format ?? {}) ||
        branchId !== (editableFacts?.branchId ?? '') ||
        JSON.stringify([
          draft,
          coordinates,
          names,
          confirmedUnnamed,
          kind,
          lifecycle,
          successorLocationId,
        ]) !== initialSignature),
    isSubmitting: busy || lookingUp,
    hasIssues:
      coordinateInvalid || (editing && !editedNames.success) || lifecycleInvalid,
    canEdit: Boolean(canEditRecord && place.state !== 'redirect' && place.facts),
    content: place.canManageCommunityLocks ? lockControls : null,
    canPublish: false,
    showPublishAction: false,
    showDeleteAction: false,
    submit: () => {
      reviewForm?.requestSubmit()
    },
    reset: cancel,
  })
})
</script>

{#snippet lockControls()}
  <CommunityCurationLocks
    disabled={busy}
    openFields={place.communityLocks?.openFields ?? {}}
    load={async () => {
      const controls = getCommunityCurationLocks({ locationId: place.id })
      await controls.refresh()
      return await controls
    }}
    save={async (expectedRevision, openFields) => {
      await setCommunityCurationLocks({
        locationId: place.id,
        expectedRevision,
        openFields,
      })
      await onSaved()
    }}
  />
{/snippet}

{#snippet recordContent()}
  <Tabs
    value={recordView}
    showList={false}
    label={m.location_record_views()}
    items={[
      { value: 'core', label: m.location_record_identity() },
      { value: 'relationships', label: m.location_record_relationships() },
    ]}
  >
    {#snippet children(view)}
      {#if view === 'core'}
        <div class="grid gap-6 px-6 py-6 @min-[900px]:grid-cols-[15rem_minmax(0,1fr)]">
          <LocationRecordDetails {place} isEditing={editing} />
          <div
            class="@min-[900px]:border-border min-w-0 space-y-6 @min-[900px]:border-l @min-[900px]:pl-6"
          >
            {#if !place.facts}
              <LocationAccessibility locationId={place.id} readOnly />
            {/if}
            {#if editing}
              <section
                class="border-border space-y-5 border-b pb-6"
                aria-label={m.location_record_identity()}
              >
                <h2 class="text-lg font-semibold">{m.location_record_identity()}</h2>
                {#if communityRecord &&
                  Object.values(place.communityLocks?.openFields ?? {}).some(
                    value => value === false,
                  )}
                  <p class="text-muted-foreground text-sm">
                    Some community fields are locked. A save that changes a locked field
                    is rejected as a whole.
                  </p>
                {/if}
                <div
                  class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-8"
                >
                  <LocationKindField
                    value={kind}
                    disabled={busy ||
                      communityRecord ||
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
                <DraftLocationNameFields
                  {names}
                  kind={activeKind}
                  localeState={editorLocaleState}
                  translations={localeState.expanded}
                  isEditing={!busy && !communityClosed('names')}
                  recordKey={place.id}
                  onChange={next => {
                    if (Object.values(next).some(value => value.trim()))
                      unnamedChoice = false
                    names = Object.fromEntries(
                      Object.entries(next).map(([tag, value]) => [
                        tag.toLowerCase(),
                        value,
                      ]),
                    )
                  }}
                />
                {#if activeKind === 'building'}
                  <BuildingUnnamedField
                    checked={confirmedUnnamed}
                    hasName={hasDraftName}
                    disabled={busy || communityClosed('names')}
                    onChange={checked => (unnamedChoice = checked)}
                  />
                {/if}
                {#if activeKind === 'establishment'}
                  <div
                    class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-8"
                  >
                    {#if communityRecord}
                      <IdentityCataloguePicker
                        kind="brand"
                        value={brandLink}
                        organisationId={place.editingOrganisationId}
                        disabled={busy ||
                          communityClosed('brandId') ||
                          communityClosed('brands')}
                        onChange={id => {
                          brandLink = id
                          changedLinks = { ...changedLinks, brandId: true }
                        }}
                      />
                      <IdentityCataloguePicker
                        kind="group"
                        value={groupLink}
                        organisationId={place.editingOrganisationId}
                        disabled={busy || communityClosed('groupId')}
                        onChange={id => {
                          groupLink = id
                          changedLinks = { ...changedLinks, groupId: true }
                        }}
                      />
                    {/if}
                    <LocationLocaleField
                      label={m.location_field_branch()}
                      value={branch}
                      localeState={editorLocaleState}
                      translations={localeState.expanded}
                      disabled={busy || communityClosed('branch')}
                      onChange={next => (branch = next)}
                    />
                    <LocationLocaleField
                      label={m.location_field_format()}
                      value={format}
                      localeState={editorLocaleState}
                      translations={localeState.expanded}
                      disabled={busy || communityClosed('format')}
                      onChange={next => (format = next)}
                    />
                    {#if !communityRecord}
                      <TextInput
                        name=""
                        label={m.location_field_branch_id()}
                        value={branchId}
                        isEditing={!busy && !communityRecord}
                        inputAttrs={{ maxlength: 200 }}
                        controlClass="bg-transparent!"
                        onValueChange={next => (branchId = next)}
                      />
                    {/if}
                  </div>
                {/if}
                {#if communityRecord && activeKind === 'establishment'}
                  <LocationCommunications
                    value={{ ...editableFacts, ...profileValues }}
                    isEditing={!busy && Boolean(place.canEditShared)}
                    onChange={value => (profileValues = { ...profileValues, ...value })}
                  />
                {/if}
                {#if place.canEditShared && communityRecord}
                  <LocationBrandEditor
                    localeState={editorLocaleState}
                    translations={localeState.expanded}
                    association={{
                      version: place.sharedRevision ?? expectedRevisionId,
                      brandMode: 'inherit',
                      effective: { brands: editableFacts?.brands ?? [] },
                    }}
                    edit={sharedBrandEdit}
                    isEditing={!busy && !communityClosed('brands')}
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
            {#if editing}
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
            {/if}
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
              <fieldset
                disabled={busy || communityClosed('location.address')}
                class="@container grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] items-start gap-8"
              >
                <AddressDetails
                  localeState={editorLocaleState}
                  translations={localeState.expanded}
                  showLocaleToolbar={false}
                  hideDisplayAddress={!editing}
                  onLocaleStateChange={next => (localeState = next)}
                  suggestionKey={JSON.stringify([place.id, point])}
                  onSuggestStreetNumber={async () =>
                    (await numberMapController?.getStreetNumberAt?.([
                      point[0],
                      point[1],
                    ])) ?? null}
                  locationKind={activeKind}
                  accessibilityLocationId={place.id}
                  accessibilityDraft={profileValues.accessibility ??
                    editableFacts?.accessibility ??
                    undefined}
                  onAccessibilityDraftChange={communityRecord &&
                  place.canEditShared &&
                  !communityClosed('accessibility')
                    ? value => {
                        if (value && !Object.keys(value).length) return
                        profileValues = {
                          ...profileValues,
                          accessibility: { ...UNKNOWN_ACCESSIBILITY, ...value },
                        }
                      }
                    : undefined}
                  {address}
                  isEditing={editing}
                  showAccessHints={false}
                  show3dAddressOptions={activeKind !== 'building'}
                  onChange={next => (draft = next)}
                />
                <AddressDivisions
                  class="@min-[50rem]:border-t-0 @min-[50rem]:pt-0"
                  {address}
                  coordinates={point}
                  isEditing={editing}
                  onChange={next => (draft = next)}
                />
                {#if editing && draft}
                  <details class="border-border col-span-full border-t pt-4">
                    <summary class="text-muted-foreground cursor-pointer text-sm">
                      {m.location_address_parse()}
                    </summary>
                    <div class="pt-3">
                      <LocalAddressParseReview
                        {draft}
                        locationKind={activeKind}
                        disabled={busy}
                        onAccept={proposal => {
                          if (!draft) return
                          parseReview = proposal
                          draft = applyLocalAddressParse(
                            $state.snapshot(draft),
                            proposal.content,
                          )
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
          </div>
        </div>
      {:else if view === 'relationships'}
        <div class="space-y-6 px-6 py-6">
          <LocationRelationships
            onCompositionSaved={onSaved}
            locationId={place.id}
            kind={place.kind}
            organisationId={place.editingOrganisationId ?? null}
            {queryScope}
            canEdit={editing && Boolean(place.canEditAddress)}
          />

          {#if place.facts?.successorLocationId}
            <a
              class="text-primary text-sm underline"
              href={`/admin/locations/${encodeURIComponent(place.facts.successorLocationId)}`}
            >
              {m.location_successor_id()}: {place.facts.successorLocationId}
            </a>
          {/if}
        </div>
      {/if}
    {/snippet}
  </Tabs>
{/snippet}

<form
  class="contents"
  bind:this={reviewForm}
  onsubmit={event => {
    event.preventDefault()
    void save()
  }}
>
  {#if place.facts}
    <FormFeatureAddress
      displayAddressInToolbar={true}
      locationKind={activeKind}
      {address}
      coordinates={point}
      isEditing={editing}
      isLoading={busy || lookingUp}
      fixedMap={true}
      hideDetails={true}
      toolbarInfoBeforeCoordinates={true}
      showLookup={false}
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
        {@const indoorSource = place.indoorSource}
        <div
          class="grid h-full min-h-0 min-w-0"
          class:grid-cols-2={Boolean(place.indoorSource?.href)}
          data-location-profile-maps
        >
          {#if indoorSource?.href}
            <div
              class="border-border relative min-h-0 min-w-0 overflow-hidden border-r"
              data-location-indoor-map
            >
              <ExpandableMap label="indoor map">
                {#snippet children(expanded)}
                  <LocationIndoorMap
                    {expanded}
                    source={indoorSource}
                    contextMap={numberMapController}
                  />
                {/snippet}
              </ExpandableMap>
            </div>
          {/if}
          <div
            class="relative min-h-0 min-w-0 overflow-hidden"
            data-location-context-map
          >
            <ExpandableMap
              label="context map"
              onResize={() => numberMapController?.resize()}
            >
              {#snippet children(expanded)}
                <MapPrimitive
                  premisesMapId={place.indoorSource?.href
                    ? place.indoorSource.mapId
                    : undefined}
                  initialZoom={place.indoorSource?.href ? 18 : 20}
                  onMapReady={controller => (numberMapController = controller)}
                  coordinates={point}
                  addressMeta={{ address }}
                  draggable={editing && !busy && !communityClosed('location.geometry')}
                  onCoordinateChange={moveMarker}
                />
              {/snippet}
            </ExpandableMap>
          </div>
        </div>
      {/snippet}
      {#snippet toolbarInfo()}
        <LocaleToolbar
          horizontal={true}
          class="max-w-[calc(100vw-8rem)]"
          {selectedLocales}
          visibleLocales={editorLocaleState.visibleLocales}
          expanded={localeState.expanded}
          options={contentLocaleOptions(getLocaleKey())}
          allowAdd={editing}
          disabled={busy}
          {contentLocales}
          onExpandedChange={expanded =>
            (localeState = { ...editorLocaleState, expanded })}
          onChange={change =>
            (localeState = { ...change, expanded: localeState.expanded })}
        />
      {/snippet}
      {#snippet locationControl()}
        <div
          class="text-primary flex min-w-0 items-center gap-2"
          data-location-record
          data-tooltip={kindLabel}
        >
          <LocationAvatar
            kind={activeKind}
            category={place.indoorSource?.category}
            class="size-6"
          />
          <span class="min-w-0 text-sm font-semibold break-words whitespace-normal"
            >{title}</span
          >
          <span
            class="text-muted-foreground hidden shrink-0 text-xs @min-[900px]:inline"
            >{kindLabel}</span
          >
          {#if status !== 'unknown'}
            <span class="text-muted-foreground shrink-0 text-xs" data-location-status
              >{lifecycleLabel(status)}</span
            >
          {/if}
        </div>
      {/snippet}
      {#snippet locationContent()}
        {@render recordContent()}
      {/snippet}
    </FormFeatureAddress>
  {:else}
    {@render recordContent()}
  {/if}
</form>
