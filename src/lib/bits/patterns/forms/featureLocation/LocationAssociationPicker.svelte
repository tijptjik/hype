<script lang="ts">
// SVELTE
import { onMount, onDestroy, untrack, tick } from 'svelte'
import { fade, slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// COMPONENTS
import LocationKindField from '../localLocationAddress/LocationKindField.svelte'
// TAXONOMY
import { expandLocationMatchingTypes } from '#lib/locations/taxonomy.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
// COMPONENTS
import BuildingPartParents from '../localLocationAddress/BuildingPartParents.svelte'
import AssociationUnitInput from './AssociationUnitInput.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
import AddressDisplayField from '../formFeatureAddress/AddressDisplayField.svelte'
import AssociationMarkerChoice from './AssociationMarkerChoice.svelte'
import LocationAssociationHeading from './LocationAssociationHeading.svelte'
import LocationAssociationIcon from '#lib/bits/custom/locationAssociationIcon/LocationAssociationIcon.svelte'
import AssociationFieldInput from './AssociationFieldInput.svelte'
import { addressLocaleLabel } from '../formFeatureAddress/addressLocaleLabel.js'
// ICONS
import InfoIcon from 'virtual:icons/lucide/info'
import CheckIcon from 'virtual:icons/lucide/check'
import PencilIcon from 'virtual:icons/lucide/pencil'
import LoaderIcon from 'virtual:icons/lucide/loader-circle'
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
import ArrowLeftIcon from 'virtual:icons/lucide/arrow-left'
import ArrowRightIcon from 'virtual:icons/lucide/arrow-right'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import ChevronIcon from 'virtual:icons/lucide/chevron-down'
import SearchIcon from 'virtual:icons/lucide/search'
import ReselectIcon from 'virtual:icons/lucide/replace'
import StreetIcon from 'virtual:icons/lucide/road'
import BuildingIcon from 'virtual:icons/lucide/building-2'
import ComplexIcon from 'virtual:icons/lucide/blocks'
import NumberIcon from 'virtual:icons/lucide/hash'
import LayersIcon from 'virtual:icons/lucide/layers'
import UnitIcon from 'virtual:icons/lucide/door-open'
import AccessIcon from 'virtual:icons/lucide/signpost'
// DOMAIN
import {
  ASSOCIATION_ATTENTION_SCORE,
  associationMatch,
  associationGroupDiffers,
} from '#lib/locations/associationMatch.js'
import { locationSyncMode } from '#lib/locations/associationSync.js'
import {
  ASSOCIATION_KINDS,
  type AssociationKind,
  type AssociationLookup,
} from '#lib/locations/association.js'
import {
  ADDRESS_CHOICE_GROUPS,
  associationNames,
  defaultAddressChoices,
  combineAssociationAddress,
  normalizeAssociationComponents,
  editAssociationAddress,
  type AddressReviewEdits,
  type AssociationUnitEdits,
  type AddressChoiceGroup,
  type AddressChoices,
} from '#lib/locations/associationAddress.js'
import { addressComponentValue } from '#lib/addresses/presentation.js'
import { addressName } from '#lib/addresses/formatting.js'
import { setAddressExpression } from '#lib/addresses/addressExpressions.js'
import type { LocaleKey } from '#lib/types.js'
import { addressNameLabel } from '#lib/addresses/nameSearch.js'
import { withSimplifiedChinese } from '#lib/addresses/chinese.js'
import type { AddressName } from '#lib/addresses/nameCatalogue.js'
import { parseStreetNumber } from '#lib/addresses/streetNumber.js'
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
import { ADDRESS_LOCALES, getAddressDisplay } from '#lib/addresses/featureAddress.js'
import {
  locationDistance,
  locationSearchColor,
  type LocationSearchMarker,
} from '#lib/locations/searchPresentation.js'
// BITS COMPONENTS
import LoadingSkeleton from '#lib/bits/custom/skeleton/LoadingSkeleton.svelte'
// TYPES
import type { DraftLocationSearchResult as Result } from './draftLocationSearch.types.js'
import type {
  AssociationSearchInput,
  AssociationSearchResult,
} from '#lib/locations/associationSearch.js'

let {
  origin,
  allowedLocationKinds: configuredLocationKinds,
  cached = [],
  projectId,
  search,
  onAccept,
  onCancel,
  onPreview,
  onSpaceNeeded,
  onMapCandidates,
  showHeading = true,
  autoAcceptSpecific = false,
  markerNumberFor = () => 0,
}: {
  origin: Result
  allowedLocationKinds?: readonly string[]
  showHeading?: boolean
  autoAcceptSpecific?: boolean
  cached?: Result[]
  projectId?: string
  search: (input: AssociationSearchInput) => Promise<AssociationSearchResult>
  onAccept: (result: Result) => void
  onSpaceNeeded?: (overflow: number) => void
  onMapCandidates?: (
    markers: LocationSearchMarker[],
    select: (id: string) => void,
  ) => void
  onCancel: () => void
  onPreview?: (result: Result, preserveZoom?: boolean) => void
  markerNumberFor?: (result: Result) => number
} = $props()
const allowedLocationKinds = $derived(
  configuredLocationKinds
    ? expandLocationMatchingTypes(configuredLocationKinds)
    : undefined,
)

const displayKinds = $derived(
  (allowedLocationKinds
    ? ASSOCIATION_KINDS.filter(kind => allowedLocationKinds.includes(kind)).sort(
        (a, b) => allowedLocationKinds.indexOf(a) - allowedLocationKinds.indexOf(b),
      )
    : [...ASSOCIATION_KINDS].reverse()
  ).filter(
    kind =>
      kind !== 'infrastructure' &&
      (!allowedLocationKinds || allowedLocationKinds.includes(kind)),
  ),
)
const initial = untrack(() => origin)
let buildingId = $state(initial.address.association?.buildingId ?? '')
let parentPartId = $state(initial.address.association?.parentPartId ?? '')
const originalAddress = $derived(
  normalizeAssociationComponents($state.snapshot(origin.address)),
)
let kind = $state<AssociationKind>(
  untrack(() => {
    const retained = initial.address.association?.kind ?? initial.kind
    const candidate = retained === 'infrastructure' ? 'built' : retained
    return !allowedLocationKinds || allowedLocationKinds.includes(candidate)
      ? candidate
      : (displayKinds[0] ?? candidate)
  }),
)
let names = $state<Record<AssociationKind, Record<string, string>>>({
  address: {},
  premises: associationNames(initial.address, 'premises'),
  building: associationNames(initial.address, 'building'),
  building_part: {},
  infrastructure: {},
  street: {},
  natural: {},
  built: {},
  structure: {},
  landform: {},
  coastal_feature: {},
  water_feature: {},
  service_point: {},
  establishment: {},
  [initial.address.association?.kind ?? initial.kind]:
    initial.address.association?.names ?? initial.names,
})
let candidates = $state<Record<AssociationKind, Result[]>>({
  address: [],
  premises: [],
  building: [],
  building_part: [],
  infrastructure: [],
  street: [],
  natural: [],
  built: [],
  structure: [],
  landform: [],
  coastal_feature: [],
  water_feature: [],
  service_point: [],
  establishment: [],
})
let lookups = $state<Record<AssociationKind, AssociationLookup>>({
  address: 'matched',
  premises: 'not-checked',
  building: 'not-checked',
  building_part: 'not-checked',
  infrastructure: 'not-checked',
  street: 'not-checked',
  natural: 'not-checked',
  built: 'not-checked',
  structure: 'not-checked',
  landform: 'not-checked',
  coastal_feature: 'not-checked',
  water_feature: 'not-checked',
  service_point: 'not-checked',
  establishment: 'not-checked',
})
let hoveredCandidate = $state<string | null>(null)
let focusedCandidate = $state<string | null>(null)
let matched = $state<Result | null>(null)
const viewPhase = $derived(
  kind === 'address' ? 'address' : matched ? 'review' : 'results',
)
let inferred = $state(false)
let knownMatches = $state<Partial<Record<AssociationKind, Result>>>({})
let userChoseKind = false
let choices = $state<AddressChoices | null>(null)
let moveMarker = $state(false)
let changingSelection = $state(false)
let editingPin = $state<string | null>(null)
let customPins = $state<Record<string, [number, number]>>({})
const selectedPin = $derived(moveMarker && matched ? matched : origin)
/** Preview a draft pin without changing the source coordinates or camera zoom.
 * @param result Reviewed source. @returns A preview with any authored pin position.
 */
function pinPreview(result: Result): Result {
  return customPins[result.id]
    ? { ...result, address: { ...result.address, coordinates: customPins[result.id] } }
    : result
}
/** Switch the selected pin and leave drag mode.
 * @param result Selected position. @returns Nothing.
 */
function selectPin(result: Result): void {
  editingPin = null
  onPreview?.(pinPreview(result), true)
}
/** Restore a pin's source coordinates without changing the selected position.
 * @param result Position whose custom coordinates should be discarded.
 * @returns Nothing.
 */
function resetPin(result: Result): void {
  delete customPins[result.id]
  if (editingPin === result.id) editingPin = null
  onPreview?.(pinPreview(selectedPin), true)
}
/** Enable dragging only for the chosen pin, preserving the current camera zoom.
 * @returns Nothing.
 */
function editPin(): void {
  editingPin = editingPin === selectedPin.id ? null : selectedPin.id
  if (editingPin) onPreview?.(pinPreview(selectedPin), true)
}
const initialCustom =
  initial.kind !== 'address' &&
  (initial.address.association?.mode === 'unlinked' ||
    Boolean(
      initial.localKind &&
        !initial.source &&
        !initial.identity &&
        !initial.buildingSource,
    ))
let custom = $state(initialCustom)
let initialSearchPending = $state(true)
let alreadyMostSpecific = $state(false)
let autoAcceptTimer: ReturnType<typeof setTimeout> | undefined
const prefilled = untrack(() => $state.snapshot(names))
let provisional = $state<Partial<Record<AssociationKind, Result>>>(
  initialCustom
    ? {
        [initial.kind]: {
          ...initial,
          id: initial.id.startsWith('custom:')
            ? initial.id
            : `custom:${initial.id}:${initial.kind}`,
          names: { ...(initial.address.association?.names ?? initial.names) },
          recordMode: 'unlinked',
        },
      }
    : {},
)
let completedEmpty = $state<Record<AssociationKind, boolean>>({
  address: false,
  premises: false,
  building: false,
  building_part: false,
  infrastructure: false,
  street: false,
  natural: false,
  built: false,
  structure: false,
  landform: false,
  coastal_feature: false,
  water_feature: false,
  service_point: false,
  establishment: false,
})
let edits = $state<AddressReviewEdits>({})
let activeField = $state<string | null>(null)
let unitEdits = $state<AssociationUnitEdits>({})
let translations = $state(false)
const selectorPreferenceKey = 'hype:location-association:expanded'
let selectorExpanded = $state(true)
/** Remember the user's choice across location forms and browser sessions. */
function toggleSelector(): void {
  selectorExpanded = !selectorExpanded
  try {
    localStorage.setItem(selectorPreferenceKey, String(selectorExpanded))
  } catch {
    /* Storage may be unavailable; keep the in-memory choice. */
  }
}
let showLegend = $state(false)
let nameEdits = $state<Record<string, string> | null>(null)
let selectedStreet = $state<AddressName | null>(null)
let pendingInputs = $state<Record<string, boolean>>({})
let showAllComponents = $state(false)
let discoveryLayoutVersion = 0
let nameEditHeight = $state(36)
const editingFields = $derived(
  showAllComponents ||
    activeField !== null ||
    Object.keys(edits).length > 0 ||
    nameEdits !== null,
)
const visibleLocales = $derived([
  getLocaleKey(),
  ...(translations && editingFields
    ? (Object.keys(ADDRESS_LOCALES) as LocaleKey[]).filter(
        locale => locale !== getLocaleKey(),
      )
    : []),
])
const nameTarget = $derived(matched ?? (custom ? provisional[kind] : undefined))
const hasNameEdits = $derived(
  Object.entries(nameEdits ?? {}).some(
    ([tag, value]) =>
      value !==
      (Object.entries(nameTarget?.names ?? {}).find(
        ([sourceTag]) => sourceTag.toLowerCase() === tag.toLowerCase(),
      )?.[1] ?? ''),
  ),
)
// Editing supported locales must retain every other published language.
const reviewedNames = $derived({
  ...Object.fromEntries(
    Object.entries(nameTarget?.names ?? {}).map(([tag, name]) => [
      tag.toLowerCase(),
      name,
    ]),
  ),
  ...nameEdits,
})
const timers: Partial<Record<AssociationKind, ReturnType<typeof setTimeout>>> = {}
const candidatePools: Record<AssociationKind, Result[]> = {
  address: [],
  premises: [],
  building: [],
  building_part: [],
  infrastructure: [],
  street: [],
  natural: [],
  built: [],
  structure: [],
  landform: [],
  coastal_feature: [],
  water_feature: [],
  service_point: [],
  establishment: [],
}
let alive = true
const requests: Record<AssociationKind, number> = {
  address: 0,
  premises: 0,
  building: 0,
  building_part: 0,
  infrastructure: 0,
  street: 0,
  natural: 0,
  built: 0,
  structure: 0,
  landform: 0,
  coastal_feature: 0,
  water_feature: 0,
  service_point: 0,
  establishment: 0,
}
const tag = $derived(ADDRESS_LOCALES[getLocaleKey()])
const differences = $derived(
  matched
    ? (Object.keys(ADDRESS_CHOICE_GROUPS) as AddressChoiceGroup[]).filter(group =>
        associationGroupDiffers(originalAddress, matched!.address, group),
      )
    : [],
)
const comparingRecords = $derived(Boolean(matched && !sameRecord(origin, matched)))
// Make room for merge details on entry without changing the saved discovery preference.
$effect(() => {
  if (comparingRecords) {
    selectorExpanded = false
    showLegend = false
  }
})
const firstPresent = $derived(displayKinds.findIndex(value => present(value)))
// Raw source differences can be metadata-only (for example an unused block type).
// Keep used/corrected parts visible; empty display rows belong only in the expanded editor.
const reviewGroups = $derived(
  showAllComponents
    ? (Object.keys(ADDRESS_CHOICE_GROUPS) as AddressChoiceGroup[])
    : [
        ...new Set([
          ...(comparingRecords ? differences : []),
          ...Object.keys(edits),
          ...Object.keys(unitEdits),
        ] as AddressChoiceGroup[]),
      ].filter(group =>
        visibleLocales.some(locale =>
          [originalAddress, matched?.address, reviewedAddress].some(
            address => address && groupText(address, group, locale) !== '—',
          ),
        ),
      ),
)
const numberValid = $derived(
  Object.values(edits.number ?? {}).every(
    value => !value?.trim() || parseStreetNumber(value).valid,
  ),
)
const canAccept = $derived(
  (!allowedLocationKinds || allowedLocationKinds.includes(kind)) &&
    (kind !== 'building_part' || Boolean(matched?.identity) || Boolean(buildingId)) &&
    !changingSelection &&
    numberValid &&
    !Object.values(pendingInputs).some(Boolean) &&
    (!nameEdits || Object.values(reviewedNames).some(name => name.trim())) &&
    (kind === 'address' ||
      Boolean(matched) ||
      (custom &&
        Boolean(
          provisional[kind] &&
            Object.values(provisional[kind]!.names).some(name => name.trim()),
        ))),
)
const reviewedAddress = $derived(
  matched && choices
    ? editAssociationAddress(
        combineAssociationAddress(
          $state.snapshot(originalAddress),
          $state.snapshot(matched.address),
          $state.snapshot(choices),
        ),
        $state.snapshot(edits),
        selectedStreet?.id,
        $state.snapshot(unitEdits),
      )
    : originalAddress,
)
const distance = $derived(
  matched?.address.coordinates && origin.address.coordinates
    ? locationDistance(
        customPins[origin.id] ?? origin.address.coordinates,
        customPins[matched.id] ?? matched.address.coordinates,
      )
    : 0,
)
const visibleProvisional = $derived(
  provisional[kind] && queryMatches(provisional[kind]!, names[kind][tag] ?? '')
    ? provisional[kind]
    : undefined,
)
const resultRows = $derived(
  candidates[kind]
    .filter(row => !visibleProvisional || !sameRecord(row, visibleProvisional))
    .sort(
      (a, b) => associationMatch(origin, b).score - associationMatch(origin, a).score,
    ),
)
const ghost = $derived(
  visibleProvisional ??
    (kind !== 'address' && Object.values(names[kind]).some(name => name.trim())
      ? {
          id: `custom:${origin.id}:${kind}`,
          kind,
          names: names[kind],
          address: originalAddress,
        }
      : undefined),
)
const resetAvailable = $derived(
  (names[kind][tag] ?? '') !==
    ((provisional[kind]?.names ?? prefilled[kind])[tag] ?? ''),
)

/** Identify the same selected record across discovery and local identity wrappers.
 * @param original Starting Location. @param selected Selected Location.
 * @returns Whether both wrappers identify the same record, preserving distinct building address alternatives.
 */
function sameRecord(original: Result, selected: Result): boolean {
  if (original.id === selected.id) return true
  if (
    original.identity?.locationId &&
    original.identity.locationId === selected.identity?.locationId
  )
    return true
  const sourceId = original.source?.ssId ?? original.identity?.ssId
  if (sourceId && sourceId === (selected.source?.ssId ?? selected.identity?.ssId))
    return true
  return Boolean(
    original.buildingSource &&
      selected.buildingSource &&
      original.buildingSource.id === selected.buildingSource.id &&
      original.buildingSource.addressId === selected.buildingSource.addressId,
  )
}

/** Match search text against immutable record names. @param row Record. @param query Search text. @returns Whether the record belongs in the result list. */
function queryMatches(row: Result, query: string): boolean {
  const needle = normalizeNameSearch(query)
  return (
    !needle ||
    Object.values(row.names).some(name => normalizeNameSearch(name).includes(needle))
  )
}
/** Distinguish record provenance from the Feature's association state. @param row Candidate. @returns Visual record category. */
function recordMode(row: Result): 'manual' | 'unlinked' | 'linked' {
  return (
    row.recordMode ??
    (row.source || row.buildingSource || row.identity?.ssId
      ? 'linked'
      : row.address.association?.mode === 'manual'
        ? 'manual'
        : 'unlinked')
  )
}
/** Restore the original query and reselect the user's provisional record. @returns Nothing. */
function resetSearch(): void {
  editName((provisional[kind]?.names ?? prefilled[kind])[tag] ?? '')
  custom = Boolean(provisional[kind])
}

/** Keep result badges, map markers and the marker comparison on the same numbering.
 * @param row Association candidate. @returns One-based visible result number; zero denotes the original pin.
 */
function associationMarkerNumber(row: Result): number {
  const index = resultRows.findIndex(candidate => candidate.id === row.id)
  return index >= 0 ? index + 1 : row.id === origin.id ? 0 : markerNumberFor(row)
}

// Association search owns its markers while open; hovering previews without accepting or moving the Feature pin.
$effect(() => {
  const rows = matched ? [matched] : kind === 'address' ? [] : resultRows
  const highlighted = hoveredCandidate ?? focusedCandidate
  const mapped = rows.some(row => row.id === origin.id) ? rows : [origin, ...rows]
  const markers: LocationSearchMarker[] = mapped.flatMap(row =>
    row.address.coordinates
      ? [
          {
            id: row.id,
            kind: row.kind,
            number: associationMarkerNumber(row),
            coordinates: customPins[row.id] ?? row.address.coordinates,
            ...(editingPin === row.id
              ? {
                  onReposition: (coordinates: [number, number]): void => {
                    customPins[row.id] = coordinates
                  },
                }
              : {}),
            ...(rows.some(candidate => candidate.id === row.id)
              ? { fitGroup: `association:${origin.id}:${kind}` }
              : {}),
            label:
              row.names[tag] ||
              Object.values(row.names).find(Boolean) ||
              getAddressDisplay(row.address, getLocaleKey()),
            highlighted: row.id === highlighted,
            ...(matched ? { fitGroup: `association:${origin.id}:${matched.id}` } : {}),
            selected: row.id === matched?.id,
            previewOnly: true,
            ...(associationMarkerNumber(row) === 0 ? { color: '#3b82f6' } : {}),
          },
        ]
      : [],
  )
  untrack(() =>
    onMapCandidates?.(markers, id => {
      const row = rows.find(candidate => candidate.id === id)
      if (row) compare(row)
    }),
  )
})

/** Read the strongest candidate independently of which level is selected.
 * @param value Association level. @returns Evidence strength, never a probability.
 */
function matchStrength(value: AssociationKind): number {
  if (
    origin.kind === value &&
    (origin.source || origin.identity || origin.buildingSource)
  )
    return 100
  if (value === 'address')
    return origin.address.source.address2dId || origin.address.source.address3dId
      ? 100
      : 0
  const rows = [
    ...candidates[value],
    ...(knownMatches[value] ? [knownMatches[value]!] : []),
    ...(matched?.kind === value ? [matched] : []),
  ]
  return Math.max(
    0,
    ...rows
      .filter(row => queryMatches(row, names[value][tag] ?? ''))
      .map(row => associationMatch(origin, row).score),
  )
}
/** Flag evidence worth reviewing without accepting a candidate.
 * @param value Association level. @returns Whether its best candidate reaches the attention threshold.
 */
function resolved(value: AssociationKind): boolean {
  return matchStrength(value) >= ASSOCIATION_ATTENTION_SCORE
}
/** Read address evidence separately from identity resolution. @param value Kind. @returns Whether the notch is solid. */
function present(value: AssociationKind): boolean {
  return (
    value === 'address' ||
    resolved(value) ||
    Object.keys(associationNames(origin.address, value)).length > 0
  )
}
/** Reconcile after a short typing delay; request generations isolate edits, cancellations and late provider replies.
 * @param value Kind being checked. @returns Completion without automatically selecting a candidate.
 */
async function reconcile(value: AssociationKind): Promise<void> {
  if (value === 'address') return
  clearTimeout(timers[value])
  const request = ++requests[value]
  const seed = JSON.stringify(names[value])
  lookups[value] = 'checking'
  try {
    const found = await search({
      kind: value,
      names: names[value][tag]?.trim() ? { [tag]: names[value][tag] } : {},
      coordinates: origin.address.coordinates,
      projectId,
      locale: getLocaleKey(),
      cached: [...cached, origin, ...candidatePools[value]],
    })
    if (!alive || request !== requests[value] || seed !== JSON.stringify(names[value]))
      return
    candidatePools[value] = [
      ...new Map(
        [...candidatePools[value], ...found.candidates].map(row => [row.id, row]),
      ).values(),
    ]
    candidates[value] = [
      ...new Map(
        [
          ...(origin.kind === value &&
          queryMatches(origin, names[value][tag] ?? '') &&
          (origin.identity || origin.source || origin.buildingSource)
            ? [origin]
            : []),
          ...found.candidates,
        ].map(row => [row.id, row]),
      ).values(),
    ]
    // A unique complete semantic match may preselect a draft, but never silently save or override an explicit choice.
    const exact = candidates[value].filter(row => associationMatch(origin, row).exact)
    if (
      !found.incomplete &&
      exact.length === 1 &&
      !matched &&
      !userChoseKind &&
      origin.address.association?.mode !== 'manual'
    ) {
      kind = value
      compare(exact[0])
      inferred = true
    }
    candidatePools[value] = [
      ...new Map(
        [...candidatePools[value], ...candidates[value]].map(row => [row.id, row]),
      ).values(),
    ]
    completedEmpty[value] = !found.incomplete && !candidates[value].length
    lookups[value] = found.incomplete
      ? 'failed'
      : found.candidates.length > 1
        ? 'ambiguous'
        : found.candidates.length
          ? 'matched'
          : 'no-match'
  } catch {
    if (alive && request === requests[value]) {
      lookups[value] = 'failed'
      completedEmpty[value] = false
    }
  }
}
/** Filter retained results immediately and debounce provider work while the user types.
 * @param value Current input text. @returns Nothing; editing invalidates the previous selection.
 */
function editName(value: string): void {
  const selectedKind = kind
  names[selectedKind] = { ...names[selectedKind], [tag]: value }
  requests[selectedKind]++
  matched = null
  custom = false
  choices = null
  edits = {}
  unitEdits = {}
  activeField = null
  nameEdits = null
  selectedStreet = null
  pendingInputs = {}
  const query = normalizeNameSearch(value)
  const filtered = candidatePools[selectedKind].filter(row => queryMatches(row, query))
  // Retain the previous set (including an empty state) until the current request settles.
  if (filtered.length) candidates[selectedKind] = filtered
  lookups[selectedKind] = 'checking'
  clearTimeout(timers[selectedKind])
  timers[selectedKind] = setTimeout(() => void reconcile(selectedKind), 250)
}
/** Explicitly choose custom authoring rather than treating free text as a matched Location.
 * @returns Nothing; the existing source association is discarded only on confirmation.
 */
function chooseCustom(): void {
  provisional[kind] = {
    id: `custom:${origin.id}:${kind}`,
    kind,
    localKind: kind,
    names: { ...names[kind] },
    address: $state.snapshot(originalAddress),
    recordMode: 'unlinked',
  }
  custom = true
  matched = null
  choices = null
  edits = {}
  unitEdits = {}
  activeField = null
  nameEdits = null
  selectedStreet = null
  pendingInputs = {}
  // The ghost action creates and accepts in one explicit step; it does not move the map.
  void tick().then(() => accept())
}
// Each level retains its review while the user explores another level.
const levelReviews: Partial<
  Record<
    AssociationKind,
    {
      matched: Result | null
      choices: AddressChoices | null
      edits: AddressReviewEdits
      unitEdits: AssociationUnitEdits
      nameEdits: Record<string, string> | null
      selectedStreet: AddressName | null
      moveMarker: boolean
      custom: boolean
      inferred: boolean
      showAllComponents: boolean
    }
  >
> = {}
/** Switch the association level without accepting a record or losing name drafts. @param value New kind. @returns Nothing. */
function selectKind(value: AssociationKind): void {
  // Reselecting the active level preserves its comparison and unsaved corrections.
  if (value === kind) return
  editingPin = null
  discoveryLayoutVersion++
  levelReviews[kind] = $state.snapshot({
    matched,
    choices,
    edits,
    unitEdits,
    nameEdits,
    selectedStreet,
    moveMarker,
    custom,
    inferred,
    showAllComponents,
  })
  userChoseKind = true
  inferred = false
  kind = value
  hoveredCandidate = focusedCandidate = null
  custom = Boolean(
    provisional[value] && queryMatches(provisional[value]!, names[value][tag] ?? ''),
  )
  edits = {}
  unitEdits = {}
  activeField = null
  nameEdits = null
  selectedStreet = null
  pendingInputs = {}
  showAllComponents = false
  matched = null
  choices = null
  moveMarker = false
  const review = levelReviews[value]
  if (review) {
    matched = review.matched
    choices = review.choices
    edits = review.edits
    unitEdits = review.unitEdits
    nameEdits = review.nameEdits
    selectedStreet = review.selectedStreet
    moveMarker = review.moveMarker
    custom = review.custom
    inferred = review.inferred
    showAllComponents = review.showAllComponents
  }
  onPreview?.(matched ?? (custom ? provisional[value] : undefined) ?? origin)
  if (value !== 'address' && lookups[value] === 'not-checked') void reconcile(value)
}
/** Prepare a candidate comparison before association. @param row Explicitly selected candidate. @returns Nothing. */
function compare(row: Result): void {
  editingPin = null
  userChoseKind = true
  inferred = false
  if (row.id === provisional[kind]?.id) {
    custom = true
    matched = null
    choices = null
    edits = {}
    unitEdits = {}
    activeField = null
    nameEdits = null
    selectedStreet = null
    pendingInputs = {}
    moveMarker = false
    onPreview?.(row)
    return
  }
  custom = false
  edits = {}
  unitEdits = {}
  activeField = null
  nameEdits = null
  selectedStreet = null
  pendingInputs = {}
  showAllComponents = false
  knownMatches[row.kind] = row
  matched = {
    ...row,
    address: normalizeAssociationComponents(
      $state.snapshot(row.address),
      $state.snapshot(originalAddress),
    ),
  }
  choices = defaultAddressChoices(
    $state.snapshot(originalAddress),
    $state.snapshot(matched.address),
  )
  moveMarker = Boolean(row.address.coordinates)
  hoveredCandidate = focusedCandidate = null
  onPreview?.(row)
}
/** Return to candidates without accepting or changing the original record.
 * @returns Completion after the results have rendered.
 * @remarks Reveal cached candidates in the click update; do not delay their transition to paint a loading state.
 */
async function changeSelection(): Promise<void> {
  if (changingSelection) return
  changingSelection = true
  try {
    editingPin = null
    discoveryLayoutVersion++
    matched = null
    choices = null
    edits = {}
    unitEdits = {}
    activeField = null
    nameEdits = null
    selectedStreet = null
    // Publishing the alternatives fits the map; a separate preview flight would compete with it.
    await tick()
  } finally {
    changingSelection = false
  }
}
/** Keep the initial selection without applying candidate details or custom pin edits.
 * @returns Nothing; persistence remains with the owner.
 */
function acceptInitialSelection(): void {
  if (allowedLocationKinds && !allowedLocationKinds.includes(origin.kind)) return
  onAccept({
    ...$state.snapshot(origin),
    // Retaining catalogue evidence still needs a local identity when the Feature is saved.
    localKind: origin.localKind ?? (origin.source ? undefined : origin.kind),
    associationConfirmed: true,
  })
}
/** Accept one coherent association and reviewed address, leaving persistence to the owner.
 * @param manual Explicit address-only intent. @returns Nothing.
 */
function accept(manual = false): void {
  if (!canAccept || (kind === 'building_part' && !matched?.identity && !buildingId))
    return
  const selectedKind = manual ? 'address' : kind
  const target = manual ? null : custom ? (provisional[kind] ?? null) : matched
  let address: Result['address'] =
    target && choices
      ? $state.snapshot(reviewedAddress)
      : $state.snapshot(custom && target ? target.address : originalAddress)
  const customPosition = manual ? undefined : customPins[selectedPin.id]
  const mode =
    selectedKind === 'address'
      ? 'manual'
      : customPosition
        ? 'unlinked'
        : locationSyncMode(undefined, target ?? {})
  const selectedNames =
    nameEdits && selectedKind === 'establishment'
      ? Object.fromEntries(
          Object.entries($state.snapshot(reviewedNames)).filter(([, name]) =>
            name.trim(),
          ),
        )
      : (target?.names ?? names[selectedKind])
  // Custom premises/building names seed their structured component once; block parsing removes duplicated identity text.
  if (
    (!target || custom) &&
    (selectedKind === 'premises' || selectedKind === 'building')
  ) {
    for (const [locale, localeTag] of Object.entries(ADDRESS_LOCALES)) {
      if (selectedNames[localeTag]?.trim())
        address = setAddressExpression(
          address,
          locale as LocaleKey,
          selectedKind === 'premises' ? 'premisesName' : 'buildingName',
          selectedNames[localeTag],
        )
    }
    address = normalizeAssociationComponents(address)
  }
  address.association = {
    ...address.association,
    originKind: origin.address.association?.originKind ?? origin.kind,
    ...(selectedKind === 'building_part'
      ? { buildingId: buildingId || undefined, parentPartId: parentPartId || undefined }
      : {}),
    kind: selectedKind,
    mode,
    names: selectedNames,
    lookup: customPosition
      ? 'not-checked'
      : mode === 'manual'
        ? 'not-checked'
        : target && !custom
          ? 'matched'
          : lookups[selectedKind] === 'checking'
            ? 'deferred'
            : lookups[selectedKind],
    checkedAt: new Date().toISOString(),
    targetId: custom || customPosition ? undefined : target?.id,
  }
  if (target && moveMarker && target.address.coordinates)
    address.coordinates = target.address.coordinates
  if (customPosition) address.coordinates = [...customPosition]
  if (allowedLocationKinds && !allowedLocationKinds.includes(selectedKind)) return
  onAccept({
    id: customPosition
      ? `custom:${target?.id ?? origin.id}`
      : (target?.id ?? origin.id),
    kind: selectedKind,
    names: selectedNames,
    address,
    source: customPosition ? undefined : target?.source,
    identity: customPosition ? undefined : target?.identity,
    buildingSource: customPosition ? undefined : target?.buildingSource,
    localKind: !customPosition && target?.source ? undefined : selectedKind,
    nameMode:
      !customPosition && target && sameRecord(origin, target)
        ? origin.nameMode
        : 'independent',
    associationConfirmed: true,
  })
}
/** Render a component in its requested language. @param address Source address. @param group Component group. @param locale Display language. @returns Human-readable value. */
function groupText(
  address: Result['address'],
  group: AddressChoiceGroup,
  locale: LocaleKey = getLocaleKey(),
): string {
  return (
    addressName(
      addressComponentValue(address, locale, ADDRESS_CHOICE_GROUPS[group][0]),
      locale,
    ) || '—'
  )
}
/** Open just the clicked locale, preserving corrections in the other fields.
 * @param group Address component. @param locale Requested input language. @returns Nothing.
 */
function editGroup(
  group: AddressChoiceGroup,
  locale: LocaleKey = getLocaleKey(),
): void {
  edits[group] ??= {}
  activeField = `${group}:${locale}`
}
/** Distinguish a changed component from an editor that was merely opened.
 * @param group Address component. @returns Whether its reviewed value differs from the chosen source.
 */
function groupIsEdited(group: AddressChoiceGroup): boolean {
  const source =
    choices?.[group] === 'location' && matched ? matched.address : originalAddress
  return Boolean(
    Object.entries(pendingInputs).some(
      ([key, pending]) => pending && key.startsWith(group + ':'),
    ) ||
      ((edits[group] ||
        ((group === 'floor' || group === 'unit') && unitEdits[group])) &&
        associationGroupDiffers(source, reviewedAddress, group)),
  )
}
/** Restore the chosen source, including its street identity and validation state.
 * @param group Address component. @returns Nothing.
 */
function resetGroup(group: AddressChoiceGroup): void {
  delete edits[group]
  if (group === 'floor' || group === 'unit') delete unitEdits[group]
  if (activeField?.startsWith(`${group}:`)) activeField = null
  if (group === 'street') selectedStreet = null
  for (const key of Object.keys(pendingInputs))
    if (key.startsWith(`${group}:`)) delete pendingInputs[key]
}
/** Reveal one name input without turning every translation into a control.
 * @param locale Requested language. @returns Nothing.
 */
function editNameLocale(locale: LocaleKey): void {
  nameEdits ??= {}
  activeField = `name:${locale}`
}
/** Read a language without displaying a fallback as a translation.
 * @param source Localized names. @param locale Requested language. @returns Its name or an empty string.
 */
function localizedName(source: Record<string, string>, locale: LocaleKey): string {
  return (
    Object.entries(source).find(
      ([tag]) => tag.toLowerCase() === ADDRESS_LOCALES[locale],
    )?.[1] ?? ''
  )
}
/** Apply a selected catalogue name and its available translations atomically.
 * @param group Name group. @param record Chosen catalogue record. @returns Nothing.
 */
function selectCatalogueName(group: 'street' | 'building', record: AddressName): void {
  const names = withSimplifiedChinese(record.names)
  const next = { ...edits[group] }
  for (const locale of Object.keys(ADDRESS_LOCALES) as LocaleKey[]) {
    const value = addressNameLabel({ ...record, names }, locale)
    if (value) next[locale] = value
  }
  edits[group] = next
  if (group === 'street') selectedStreet = record
}
/** Label comparison groups using existing address vocabulary. @param group Group. @returns Localized label. */
function groupLabel(group: AddressChoiceGroup): string {
  return {
    premises: m.location_type_premises,
    building: m.location_type_building,
    street: m.feature_address_streetName,
    number: m.feature_address_buildingNumberExpression,
    block: m.feature_address_blockExpression,
    phase: m.feature_address_phaseExpression,
    floor: m.feature_address_floorExpression,
    unit: m.association_flat_unit,
    access: m.feature_address_accessHint,
  }[group]()
}
/** Animate a view change without remounting the cached result controls.
 * @param node Shared content panel. @param phase Initial view phase.
 * @returns Action update and animation cleanup handlers.
 */
function animateView(
  node: HTMLElement,
  phase: string,
): {
  update: (next: string) => void
  destroy: () => void
} {
  let current = phase
  let animation: Animation | undefined
  return {
    update(next) {
      if (next === current) return
      current = next
      animation?.cancel()
      if (prefersReducedMotion.current || typeof node.animate !== 'function') return
      animation = node.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 180, easing: 'ease-out' },
      )
    },
    destroy() {
      animation?.cancel()
    },
  }
}
/** Balance selected-record details against the map using their intrinsic content height.
 * @param node Scroll viewport. @returns Observer cleanup; scrolling itself never requests a resize.
 */
function measureSpace(node: HTMLDivElement): { destroy: () => void } {
  if (typeof ResizeObserver === 'undefined') return { destroy() {} }
  let frame = 0
  let previousContent = ''
  let previousRecord: string | undefined
  const content = node.firstElementChild
  const footer = node.nextElementSibling
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      // Rebalance a changed view once; streaming candidate counts must not repeatedly shrink the map.
      if (!node.clientHeight || !node.clientWidth) return
      if (matched?.id !== previousRecord) {
        previousRecord = matched?.id
        node.scrollTop = 0
      }
      const currentFooter = node.nextElementSibling
      const signature = matched
        ? `${content?.getBoundingClientRect().height}:${node.clientWidth}:${currentFooter?.getBoundingClientRect().height}:${window.innerHeight}`
        : [
            'discovery',
            discoveryLayoutVersion,
            node.clientWidth,
            window.innerHeight,
            currentFooter?.getBoundingClientRect().height,
          ].join(':')
      // A manual map resize changes available height, not content requirements; let the user bring the map back.
      if (signature === previousContent) return
      previousContent = signature
      // Positive values make room for details; negative values return spare space to the map.
      const results = node.querySelector<HTMLElement>('[data-association-results]')
      const resultHeight = results?.getBoundingClientRect().height ?? 0
      const discoveryBudget = results ? Math.min(320, window.innerHeight * 0.35) : 0
      const required =
        (content?.getBoundingClientRect().height ?? node.scrollHeight) -
        (!matched ? resultHeight - discoveryBudget : 0)
      const overflow = required + 24 - node.clientHeight
      if (Math.abs(overflow) > 1) onSpaceNeeded?.(overflow)
    })
  })
  observer.observe(node)
  if (content) observer.observe(content)
  if (footer) observer.observe(footer)
  return {
    destroy() {
      observer.disconnect()
      cancelAnimationFrame(frame)
    },
  }
}
onMount(() => {
  try {
    selectorExpanded = localStorage.getItem(selectorPreferenceKey) !== 'false'
  } catch {
    /* New users and unavailable storage keep the expanded guide. */
  }
  const initialSearches: Promise<void>[] = []
  // Discover establishment alternatives for address origins too, before revealing match scores.
  for (const value of ASSOCIATION_KINDS)
    if (
      value !== 'address' &&
      (value === kind || value === 'establishment' || Object.keys(names[value]).length)
    )
      initialSearches.push(reconcile(value))
  // Only skip a redundant confirmation after an explicit selection and complete lookup evidence.
  void Promise.all(initialSearches).finally(() => {
    if (!alive) return
    const moreSpecific = ASSOCIATION_KINDS.slice(
      ASSOCIATION_KINDS.indexOf(origin.kind) + 1,
    )
    const complete = Object.values(lookups).every(
      value => value !== 'failed' && value !== 'checking',
    )
    if (
      autoAcceptSpecific &&
      complete &&
      !initialCustom &&
      origin.kind !== 'address' &&
      kind === origin.kind &&
      origin.address.association?.mode !== 'manual' &&
      matched &&
      sameRecord(origin, matched) &&
      canAccept &&
      moreSpecific.every(
        value =>
          !Object.values(names[value]).some(name => name.trim()) &&
          !candidates[value].some(row => associationMatch(origin, row).exact),
      )
    ) {
      alreadyMostSpecific = true
      autoAcceptTimer = setTimeout(() => {
        if (alive) accept()
      }, 250)
    } else initialSearchPending = false
  })
  if (
    !initialCustom &&
    origin.kind === kind &&
    (origin.source || origin.identity || origin.buildingSource)
  )
    compare(origin)
})
onDestroy(() => {
  alive = false
  clearTimeout(autoAcceptTimer)
  for (const timer of Object.values(timers)) clearTimeout(timer)
})
</script>

{#snippet comparisonCell(
  address: Result['address'],
  group: AddressChoiceGroup,
  side: 'original' | 'location',
)}
  {@const Icon = {
    premises: ComplexIcon,
    building: BuildingIcon,
    street: StreetIcon,
    number: NumberIcon,
    block: BuildingIcon,
    phase: ComplexIcon,
    floor: LayersIcon,
    unit: UnitIcon,
    access: AccessIcon,
  }[group]}
  {@const selected = choices?.[group] === side}
  {@const shared = group === 'number' || group === 'floor' || group === 'unit'}
  <div
    data-address-choice={side}
    data-address-group={group}
    class="grid min-w-0 items-start gap-2 rounded-md p-2 {side === 'original'
      ? 'grid-cols-[minmax(0,1fr)_auto] text-right [&>svg]:order-last [&>div]:col-start-1 [&>div]:row-start-1 [&_button]:text-right'
      : 'grid-cols-[auto_minmax(0,1fr)]'} {selected
      ? 'bg-muted/50 text-foreground'
      : 'text-muted-foreground'}"
  >
    <Icon class="mt-2 size-4 shrink-0" />
    <div class="min-w-0 space-y-1 break-words whitespace-normal">
      {#each shared ? [getLocaleKey()] : visibleLocales as locale, index (locale)}
        {@const source = groupText(address, group, locale)}
        {@const value = selected ? groupText(reviewedAddress, group, locale) : source}
        {@const overridden = selected && value !== source}
        {@const key = `${group}:${locale}`}
        {@const label = `${m.association_custom_field({ field: groupLabel(group) })}${index ? ` · ${ADDRESS_LOCALES[locale]}` : ''}`}
        <div
          class="grid min-w-0 items-center gap-2 {index
            ? 'grid-cols-[auto_minmax(0,1fr)]'
            : 'grid-cols-[minmax(0,1fr)]'}"
          data-field-locale={locale}
        >
          {#if index}
            <span class="text-muted-foreground text-[10px]"
              >{addressLocaleLabel(locale)}</span
            >
          {/if}
          {#if selected && activeField === key}
            {#if group === 'floor' || group === 'unit'}
              <AssociationUnitInput
                address={reviewedAddress}
                {group}
                {locale}
                {label}
                onChange={next => {
                  unitEdits = { ...unitEdits, ...next }
                }}
                onBlur={() => {
                  if (activeField === key) activeField = null
                }}
              />
            {:else}
              <!-- Focus follows an explicit user request to edit this field. -->
              <AssociationFieldInput
                value={edits[group]?.[locale] ?? (value === '—' ? '' : value)}
                {label}
                {locale}
                family={group === 'street'
                  ? 'streets'
                  : group === 'building'
                    ? 'buildings'
                    : undefined}
                focusOnMount={true}
                {overridden}
                invalid={group === 'number' && !numberValid}
                onChange={value => {
                  edits[group] = { ...edits[group], [locale]: value }
                }}
                onSelect={record => {
                  if (group === 'street' || group === 'building')
                    selectCatalogueName(group, record)
                }}
                onPending={pending => {
                  pendingInputs[key] = pending
                }}
                onBlur={() => {
                  if (activeField === key) activeField = null
                }}
              />
            {/if}
          {:else if selected}
            <button
              type="button"
              aria-label={label}
              data-association-value
              class="hover:bg-muted/40 focus-visible:outline-primary relative min-h-9 w-full min-w-0 rounded border border-transparent py-1 pr-6 pl-2 text-left text-sm font-semibold break-words whitespace-normal focus-visible:outline-2"
              onclick={() => editGroup(group, locale)}
            >
              {value}
              {#if overridden}
                <span
                  role="img"
                  aria-label={m.association_override()}
                  class="bg-primary absolute top-1/2 right-1 size-1.5 -translate-y-1/2 rounded-full"
                ></span>
              {/if}
            </button>
          {:else}
            <span class="block min-h-9 py-1 pr-6 pl-2 font-semibold">{value}</span>
          {/if}
        </div>
      {/each}
      <span class="text-muted-foreground block pl-2 text-[10px] font-normal"
        >{groupLabel(group)}</span
      >
    </div>
  </div>
{/snippet}

{#snippet nameEditor(proposal: boolean = false)}
  {#if nameTarget}
    <section
      class="relative grid min-w-0 items-start {proposal
        ? 'grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border border-primary/25 bg-primary/5 p-5 shadow-sm sm:grid-cols-[auto_minmax(0,1fr)_auto]'
        : 'grid-cols-[auto_minmax(0,1fr)] gap-1 rounded-md border border-primary/30 bg-primary/10 py-2 pr-10 pl-2 sm:gap-2 sm:pr-12 sm:pl-3'}"
      data-association-name
      data-association-selected-record={Boolean(matched)}
      data-association-proposal={proposal || undefined}
    >
      <span
        class={proposal
          ? 'bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl'
          : 'text-muted-foreground mt-0.5'}
        ><LocationIcon
          kind={nameTarget.kind}
          class={proposal ? 'size-6' : 'size-4'}
        /></span
      >
      <div class="min-w-0 flex-1 {proposal ? 'space-y-2' : 'space-y-0.5'}">
        {#if proposal}
          <p class="text-primary text-[10px] font-semibold tracking-wide uppercase">
            {m.association_proposal()}
          </p>
        {/if}
        {#each kind === 'establishment'
          ? visibleLocales
          : [getLocaleKey()] as locale, index (locale)}
          {@const source = localizedName(nameTarget.names, locale)}
          {@const value = reviewedNames[ADDRESS_LOCALES[locale]] ?? ''}
          {@const key = `name:${locale}`}
          {@const label = `${m.association_establishment_name()}${index ? ` · ${ADDRESS_LOCALES[locale]}` : ''}`}
          <div
            class="grid min-w-0 items-center gap-2 {index
              ? 'grid-cols-[auto_minmax(0,1fr)]'
              : 'grid-cols-[minmax(0,1fr)]'}"
            data-field-locale={locale}
          >
            {#if index}
              <span class="text-muted-foreground text-[10px]"
                >{addressLocaleLabel(locale)}</span
              >
            {/if}
            {#if kind === 'establishment' && activeField === key}
              <!-- Focus follows an explicit user request to edit this field. -->
              <AssociationFieldInput
                {value}
                {label}
                {locale}
                multiline={true}
                minimumHeight={nameEditHeight}
                focusOnMount={true}
                overridden={value !== source}
                onChange={value => {
                  nameEdits = { ...nameEdits, [ADDRESS_LOCALES[locale]]: value }
                }}
                onBlur={() => {
                  if (activeField === key) activeField = null
                }}
              />
            {:else if kind === 'establishment'}
              <button
                type="button"
                aria-label={label}
                data-association-value
                class="relative w-full min-w-0 whitespace-normal break-words rounded border border-transparent pr-4 text-left font-semibold {proposal
                  ? 'min-h-8 py-1 text-base sm:text-lg'
                  : 'text-sm'} hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary"
                onclick={event => {
                  nameEditHeight = event.currentTarget.getBoundingClientRect().height
                  editNameLocale(locale)
                }}
              >
                {value || '—'}<PencilIcon
                  class="text-primary ml-2 inline size-3.5"
                  aria-hidden="true"
                />
                {#if value !== source}
                  <span
                    role="img"
                    aria-label={m.association_override()}
                    class="bg-primary absolute top-1/2 right-1 size-1.5 -translate-y-1/2 rounded-full"
                  ></span>
                {/if}
              </button>
            {:else}
              <p
                class="whitespace-normal break-words font-semibold {proposal
                  ? 'min-h-8 py-1 text-base sm:text-lg'
                  : 'text-sm'}"
              >
                {value || Object.values(nameTarget.names).find(Boolean) || '—'}
              </p>
            {/if}
          </div>
        {/each}
        <div
          class="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 {proposal
            ? 'text-xs'
            : 'text-[10px]'}"
        >
          <span>{locationKindLabel(kind)}</span>
          {#if proposal && nameTarget.taxonomyLabel}
            <span>{nameTarget.taxonomyLabel}</span>
          {/if}
          {#if proposal}
            <span class="inline-flex items-center gap-2"
              ><LocationAssociationIcon
                mode={recordMode(nameTarget)}
                class="size-3.5"
              />{recordMode(nameTarget) === 'linked'
                ? m.association_record_source()
                : recordMode(nameTarget) === 'manual'
                  ? m.association_record_manual()
                  : m.association_record_custom()}</span
            >
          {/if}
        </div>
        {#if proposal &&
          getAddressDisplay(nameTarget.address, getLocaleKey(), [], nameTarget.kind)}
          <p class="text-muted-foreground text-sm break-words whitespace-normal">
            {getAddressDisplay(nameTarget.address, getLocaleKey(), [], nameTarget.kind)}
          </p>
        {/if}
      </div>
      <div
        class="{proposal
          ? 'col-span-2 flex flex-wrap items-center justify-end gap-2 pt-1 sm:col-span-1 sm:self-center'
          : 'absolute top-1/2 right-2 -translate-y-1/2'}"
      >
        {#if proposal && matched}
          <button
            type="button"
            disabled={!canAccept}
            class="bg-primary text-primary-content focus-visible:outline-primary inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 disabled:opacity-40"
            onclick={() => accept()}
          >
            <CheckIcon class="size-4" />{m.use()}
          </button>
          <button
            type="button"
            aria-label={m.association_change_selection()}
            aria-busy={changingSelection}
            disabled={changingSelection}
            class="border-secondary/40 bg-secondary/10 text-secondary hover:bg-secondary/20 focus-visible:outline-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-2"
            onclick={changeSelection}
          >
            {#if changingSelection}
              <LoaderIcon class="size-4 motion-safe:animate-spin" aria-hidden="true" />
            {:else}
              <ReselectIcon class="size-4" />
            {/if}
            {#if changingSelection}
              <LoadingSkeleton
                label={m.association_loading_alternatives()}
                text={m.association_change_action()}
              />
            {:else}
              {m.association_change_action()}
            {/if}
          </button>
        {:else}
          {#if matched}
            <SimpleTooltip triggerClass="shrink-0" triggerProps={{ tabindex: -1 }}>
              {#snippet trigger()}
                <button
                  type="button"
                  aria-label={m.association_change_selection()}
                  aria-busy={changingSelection}
                  disabled={changingSelection}
                  class="text-primary hover:bg-primary/10 focus-visible:outline-primary flex size-8 items-center justify-center rounded focus-visible:outline-2"
                  onclick={changeSelection}
                >
                  {#if changingSelection}
                    <LoaderIcon
                      class="size-4 motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                    <span class="sr-only" role="status"
                      >{m.association_loading_alternatives()}</span
                    >
                  {:else}
                    <ReselectIcon class="size-4" />
                  {/if}
                </button>
              {/snippet}
              {m.association_change_selection()}
            </SimpleTooltip>
          {/if}
        {/if}
        {#if hasNameEdits}
          <button
            type="button"
            aria-label={m.association_reset_field({
              field: m.association_establishment_name(),
            })}
            class="text-primary hover:bg-primary/10 focus-visible:outline-primary flex size-8 items-center justify-center rounded focus-visible:outline-2"
            onclick={() => {
              nameEdits = null
              activeField = null
            }}
          >
            <ResetIcon class="size-4" />
          </button>
        {:else if comparingRecords}
          <span class="size-8" aria-hidden="true"></span>
        {/if}
      </div>
    </section>
  {/if}
{/snippet}

{#if initialSearchPending}
  <section class="bg-panel flex min-h-0 flex-1 flex-col" aria-busy="true">
    {#if showHeading}
      <LocationAssociationHeading />
    {/if}
    <div
      role="status"
      class="text-muted-foreground flex min-h-40 flex-1 items-center justify-center gap-3 px-6 py-8 text-sm"
    >
      {#if alreadyMostSpecific}
        <CheckIcon aria-hidden="true" class="text-primary size-5 shrink-0" />
      {:else}
        <LoaderIcon
          aria-hidden="true"
          class="text-primary size-5 shrink-0 motion-safe:animate-spin"
        />
      {/if}
      <span
        >{alreadyMostSpecific
          ? m.association_already_specific()
          : m.association_finding_specific()}</span
      >
    </div>
  </section>
{/if}
<section
  class={initialSearchPending
    ? 'hidden'
    : 'bg-panel flex min-h-0 flex-1 flex-col overflow-hidden'}
  inert={initialSearchPending}
  data-location-association-picker
>
  <div class="grid gap-4 p-4 sm:grid-cols-2">
    <LocationKindField
      value={kind}
      allowPartCreation={true}
      allowedKinds={displayKinds}
      onChange={next => {
        if (next !== 'unknown') selectKind(next)
      }}
    />
  </div>
  <div
    use:measureSpace
    class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    data-association-scroll
  >
    <div class="flex flex-col">
      {#if showHeading}
        <LocationAssociationHeading />
      {/if}
      <section
        class="border-border/50 bg-surface/40 relative w-full shrink-0 border-b px-2 py-6 sm:px-4"
        data-association-selector
      >
        <div
          class="mx-auto grid w-full max-w-3xl min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]"
          role="radiogroup"
          aria-label={m.association_title()}
        >
          {#each displayKinds as value, index}
            <!-- biome-ignore lint/a11y/useSemanticElements: This custom radio implements the shared notch keyboard and pointer behavior. -->
            <button
              type="button"
              role="radio"
              aria-checked={kind === value}
              aria-label={locationKindLabel(value)}
              aria-busy={lookups[value] === 'checking'}
              data-association-kind={value}
              data-evidence={resolved(value)
                ? 'location'
                : present(value)
                  ? 'address'
                  : 'none'}
              class="group/notch relative grid min-w-0 transition-[grid-template-rows,gap] duration-200 motion-reduce:transition-none {selectorExpanded
                ? 'grid-rows-[1.5rem_2rem_4rem_2rem] sm:grid-rows-[1.5rem_1.5rem_2.5rem_2rem] gap-y-2'
                : 'grid-rows-[0rem_2rem_0rem_2rem] gap-y-0'} items-center justify-items-center px-1 py-1 focus-visible:outline-none"
              onclick={() => selectKind(value)}
              onkeydown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                  return
                event.preventDefault()
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? displayKinds.length - 1
                      : (index +
                          (event.key === 'ArrowRight' ? 1 : displayKinds.length - 1)) %
                        displayKinds.length
                selectKind(displayKinds[next])
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('button')
                  [next]?.focus()
              }}
              data-tooltip={resolved(value)
                ? m.association_match_score({ score: matchStrength(value) })
                : present(value)
                  ? m.association_address_evidence()
                  : m.association_missing()}
            >
              <span
                class="min-h-0 overflow-hidden transition-opacity duration-200 {selectorExpanded
                  ? 'opacity-100'
                  : 'opacity-0'}"
                ><LocationIcon
                  kind={value}
                  class="text-muted-foreground size-6"
                /></span
              >
              <span
                class="min-w-0 self-center text-center text-[10px] font-semibold tracking-wide break-words whitespace-normal uppercase sm:text-xs"
                >{locationKindLabel(value)}</span
              >
              <span
                class="min-h-0 overflow-hidden transition-opacity duration-200 {selectorExpanded
                  ? 'opacity-100'
                  : 'opacity-0'} max-w-36 whitespace-normal break-words text-center text-[10px] leading-4 text-muted-foreground sm:text-xs"
                >{{
                  establishment: m.association_example_establishment,
                  building: m.association_example_building,
                  building_part: m.association_example_building_part,
                  infrastructure: () => 'Tunnel, retaining wall or footbridge',
                  street: () => 'Road, lane or pedestrian street',
                  natural: () => 'Hill, river or beach',
                  built: () => 'Built place with unknown form',
                  structure: () => 'Bridge, tunnel or pier',
                  landform: () => 'Peak, island or valley',
                  coastal_feature: () => 'Beach, bay or headland',
                  water_feature: () => 'River, stream, lake or reservoir',
                  service_point: () => 'Recycling, collection or drinking-water point',
                  premises: m.association_example_premises,
                  address: m.association_example_address,
                }[value]()}</span
              >
              <span
                class="relative flex w-full items-center justify-center"
                data-association-track
              >
                {#if index < displayKinds.length - 1}
                  <span
                    aria-hidden="true"
                    class="absolute left-1/2 top-1/2 w-full -translate-y-1/2 border-t-[6px] {index >=
                    firstPresent
                      ? 'border-solid border-foreground/25'
                      : 'border-dashed border-border'}"
                  ></span>
                {/if}
                <span
                  class="relative flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] bg-panel transition-colors duration-200 motion-reduce:transition-none group-focus-visible/notch:outline-1 group-focus-visible/notch:outline-offset-4 group-focus-visible/notch:outline-primary/50 {resolved(
                    value,
                  )
                    ? 'border-emerald-400'
                    : present(value)
                      ? 'border-sky-400'
                      : 'border-foreground/40 group-hover/notch:border-primary group-focus-visible/notch:border-primary'}"
                  data-association-notch
                >
                  {#if lookups[value] === 'checking'}
                    <span
                      aria-hidden="true"
                      class="absolute -inset-[6px] animate-pulse rounded-full border-[3px] border-emerald-400 motion-reduce:animate-none"
                    ></span>
                  {:else if resolved(value)}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 40 40"
                      class="pointer-events-none absolute top-1/2 left-1/2 size-11 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-emerald-400"
                      data-match-strength={matchStrength(value)}
                    >
                      <circle
                        class="text-foreground/25"
                        cx="20"
                        cy="20"
                        r="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                        pathLength="100"
                        stroke-dasharray="0 8.333333"
                      />
                      <circle
                        cx="20"
                        cy="20"
                        r="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                        pathLength="100"
                        stroke-dasharray={`${matchStrength(value)} 100`}
                      />
                    </svg>
                  {/if}
                  {#if kind === value}
                    <span
                      class="bg-primary size-2.5 rounded-full"
                      data-association-selected-dot
                    ></span>
                  {:else}
                    <span
                      class="group-hover/notch:bg-primary/40 size-2.5 rounded-full bg-transparent"
                      aria-hidden="true"
                    ></span>
                  {/if}
                </span>
              </span>
            </button>
          {/each}
        </div>
        <div
          class="absolute top-1 right-2 flex items-center gap-1"
          data-selector-controls
        >
          <button
            type="button"
            aria-label={selectorExpanded
              ? m.association_collapse_types()
              : m.association_expand_types()}
            aria-expanded={selectorExpanded}
            class="text-muted-foreground hover:bg-muted focus-visible:outline-primary flex size-8 items-center justify-center rounded focus-visible:outline-2"
            onclick={toggleSelector}
          >
            <ChevronIcon
              class="size-4 transition-transform duration-200 motion-reduce:transition-none {selectorExpanded
                ? 'rotate-180'
                : ''}"
            />
          </button>
          <button
            type="button"
            aria-label={m.association_rings_title()}
            aria-expanded={showLegend}
            class="text-muted-foreground hover:bg-muted focus-visible:outline-primary flex size-8 items-center justify-center rounded focus-visible:outline-2"
            onclick={() => (showLegend = !showLegend)}
          >
            <InfoIcon class="size-4" />
          </button>
        </div>
        {#if showLegend}
          <aside
            transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
            aria-label={m.association_rings_title()}
            class="border-border/50 mx-auto mt-6 grid max-w-3xl gap-x-8 gap-y-5 border-t px-3 pt-6 text-xs sm:grid-cols-2"
            data-association-legend
          >
            <p class="flex items-center gap-4">
              <span
                aria-hidden="true"
                class="border-foreground/40 bg-foreground/5 size-7 shrink-0 rounded-full border-[3px]"
              ></span>{m.association_missing()}
            </p>
            <p class="flex items-center gap-4">
              <span
                aria-hidden="true"
                class="size-7 shrink-0 rounded-full border-[3px] border-sky-400"
              ></span>{m.association_address_evidence()}
            </p>
            <p class="flex items-center gap-4">
              <span
                aria-hidden="true"
                class="relative size-7 shrink-0 rounded-full border-[3px] border-emerald-400"
                ><span
                  class="absolute -inset-[6px] rounded-full border-[3px] border-emerald-400/40"
                ></span></span
              >{m.association_existing()}
            </p>
            <p class="flex items-center gap-4">
              <span
                aria-hidden="true"
                class="flex size-7 shrink-0 items-center justify-center"
                ><span class="bg-primary size-2.5 rounded-full"></span></span
              >{m.association_selected_level()}
            </p>
            <p
              class="border-border/40 text-muted-foreground border-t pt-4 leading-relaxed sm:col-span-2"
            >
              {m.association_track_help()}
            </p>
          </aside>
        {/if}
      </section>
      <!-- Keep cached results mounted but hidden during review; animate the revealed view without stacking heights. -->
      <div
        use:animateView={viewPhase}
        class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6"
        data-association-view={viewPhase}
      >
        {#if kind === 'address'}
          <div class="flex justify-center" data-association-address>
            <AddressDisplayField
              address={originalAddress}
              locale={getLocaleKey()}
              isEditing={false}
              alignEnd={true}
              onChange={() => {}}
            />
          </div>
        {:else}
          <div
            class={matched ? 'hidden' : 'flex min-w-0 flex-col gap-4'}
            inert={Boolean(matched)}
            data-association-discovery
          >
            <label
              class="relative mx-auto block w-full max-w-lg"
              data-association-search
            >
              <SearchIcon
                class="text-muted-foreground pointer-events-none absolute top-3.5 left-3 size-4"
              />
              <span class="sr-only"
                >{m.association_search_kind({ kind: locationKindLabel(kind) })}</span
              >
              <input
                aria-label={`${locationKindLabel(kind)} · ${m.field_name()}`}
                aria-busy={lookups[kind] === 'checking'}
                value={names[kind][tag] ?? ''}
                placeholder={m.association_search_kind({
                  kind: locationKindLabel(kind),
                })}
                maxlength="1000"
                class="border-border focus-visible:outline-primary min-h-11 w-full rounded-md border bg-transparent py-2 pr-16 pl-10 text-base focus-visible:outline-2"
                oninput={event => editName(event.currentTarget.value)}
              >
              {#if lookups[kind] === 'checking'}
                <span
                  class="pointer-events-none absolute inset-y-0 right-10 flex items-center"
                  role="status"
                  aria-label={m.association_checking()}
                  ><LoaderIcon
                    class="text-muted-foreground size-4 animate-spin motion-reduce:animate-none"
                  /></span
                >
              {/if}
              {#if resetAvailable}
                <button
                  type="button"
                  aria-label={m.association_reset_search()}
                  class="text-muted-foreground hover:text-primary absolute inset-y-0 right-2 flex items-center px-1"
                  onclick={resetSearch}
                >
                  <ResetIcon class="size-4" />
                </button>
              {/if}
            </label>
            {#if lookups[kind] === 'failed'}
              <p class="text-muted-foreground text-xs" role="status">
                {m.association_incomplete()}
                <button type="button" class="underline" onclick={() => reconcile(kind)}>
                  {m.association_retry()}
                </button>
              </p>
            {/if}
            <div
              class="flex min-h-28 flex-1 flex-col gap-2"
              data-association-results
              aria-busy={lookups[kind] === 'checking'}
            >
              {#each resultRows as row, index (row.id)}
                {@const statusLabel =
                  row.id === provisional[kind]?.id
                    ? m.association_your_record()
                    : recordMode(row) === 'linked'
                      ? m.association_record_source()
                      : recordMode(row) === 'manual'
                        ? m.association_record_manual()
                        : m.association_record_custom()}
                <button
                  type="button"
                  data-match-score={associationMatch(origin, row).score}
                  data-association-result={row.id}
                  data-record-mode={recordMode(row)}
                  aria-pressed={custom && row.id === provisional[kind]?.id}
                  data-highlighted={(hoveredCandidate ?? focusedCandidate) === row.id}
                  class="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border p-3 text-left hover:border-primary hover:bg-primary/5 data-[highlighted=true]:border-primary data-[highlighted=true]:bg-primary/5 aria-pressed:border-primary aria-pressed:bg-primary/5 {recordMode(
                    row,
                  ) === 'linked'
                    ? 'border-solid'
                    : 'border-dashed'}"
                  onmouseenter={() => (hoveredCandidate = row.id)}
                  onmouseleave={() => (hoveredCandidate = null)}
                  onfocus={() => (focusedCandidate = row.id)}
                  onblur={() => (focusedCandidate = null)}
                  onclick={() => compare(row)}
                >
                  <span
                    data-association-number
                    class="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style:background-color={locationSearchColor(row.kind)}
                    >{index + 1}</span
                  ><span class="min-w-0 break-words whitespace-normal"
                    ><span class="block text-sm font-medium"
                      >{addressName(
                        row.names[tag] || Object.values(row.names).find(Boolean) || '',
                        getLocaleKey(),
                      )}</span
                    ><span class="text-muted-foreground block text-xs"
                      >{getAddressDisplay(row.address, getLocaleKey())}</span
                    ></span
                  ><span
                    class="grid shrink-0 justify-items-end gap-1 text-right"
                    data-association-result-meta
                  >
                    <span
                      class="inline-flex items-baseline whitespace-nowrap tabular-nums"
                    >
                      <span class="sr-only"
                        >{m.association_match_score({
                          score: associationMatch(origin, row).score,
                        })}</span
                      >
                      <span
                        aria-hidden="true"
                        class="text-foreground text-base leading-none font-semibold"
                        >{associationMatch(origin, row).score}</span
                      >
                      <span aria-hidden="true" class="text-muted-foreground text-[10px]"
                        >/100</span
                      >
                    </span>
                    <span
                      class="text-muted-foreground flex items-center justify-end gap-2"
                    >
                      {#if origin.address.coordinates && row.address.coordinates}
                        <span class="text-xs whitespace-nowrap tabular-nums">
                          {Math.round(
                            locationDistance(
                              origin.address.coordinates,
                              row.address.coordinates,
                            ),
                          )}
                          m
                        </span>
                      {/if}

                      <span
                        class="inline-flex size-4 items-center justify-center"
                        title={statusLabel}
                      >
                        <LocationAssociationIcon
                          mode={recordMode(row)}
                          class="size-3.5"
                        />
                        <span class="sr-only">{statusLabel}</span>
                      </span>
                    </span>
                  </span>
                </button>
              {/each}
              {#if !resultRows.length && completedEmpty[kind]}
                <div
                  class="text-muted-foreground flex flex-1 items-center justify-center px-4 py-10 text-center text-sm"
                  role="status"
                  data-association-empty
                >
                  <div class="max-w-sm space-y-2">
                    <p class="text-foreground font-medium">
                      {m.association_search_status()}
                    </p>
                    <p class="text-xs">{m.association_search_action()}</p>
                  </div>
                </div>
              {/if}
            </div>
          </div>

          {#if matched && choices}
            <div class="space-y-5" data-association-comparison>
              {#if comparingRecords}
                <div class="relative flex flex-col items-center gap-2">
                  <div class="space-y-1 text-center">
                    <h3 class="text-sm font-semibold">{m.association_compare()}</h3>
                    <p class="text-muted-foreground text-xs">
                      {m.association_compare_help()}
                    </p>
                  </div>
                  {#if editingFields}
                    <button
                      type="button"
                      aria-pressed={translations}
                      aria-label={m.location_address_languages()}
                      class="text-muted-foreground hover:bg-muted focus-visible:outline-primary inline-flex items-center gap-2 rounded px-2 py-1 text-xs focus-visible:outline-2"
                      onclick={() => (translations = !translations)}
                    >
                      <LanguagesIcon class="size-4" />{m.location_address_languages()}
                    </button>
                  {/if}
                </div>
              {/if}
              <div class="space-y-5">
                <div class="flex min-w-0 flex-col gap-5" data-association-columns>
                  {#if comparingRecords}
                    <div
                      class="grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-stretch gap-x-2 gap-y-3 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)]"
                      data-association-record-headers
                    >
                      <div class="min-w-0 space-y-2 text-right">
                        <div
                          data-association-original-record
                          class="text-muted-foreground flex min-w-0 flex-row-reverse items-start gap-2 rounded-md border border-transparent px-3 py-2"
                        >
                          <LocationIcon
                            kind={origin.kind}
                            class="text-muted-foreground mt-0.5 size-4 shrink-0"
                          />
                          <div class="min-w-0 space-y-0.5">
                            <p
                              class="text-sm font-semibold break-words whitespace-normal"
                            >
                              {localizedName(origin.names, getLocaleKey()) ||
                                Object.values(origin.names).find(Boolean) ||
                                getAddressDisplay(originalAddress, getLocaleKey())}
                            </p>
                            <p class="text-muted-foreground text-[10px]">
                              {locationKindLabel(origin.kind)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div class="flex flex-col items-center justify-center gap-2">
                        <span
                          class="border-primary/30 text-primary flex size-8 items-center justify-center rounded-full border"
                          role="img"
                          aria-label={m.association_candidate_selected()}
                          ><ArrowRightIcon class="size-4" /></span
                        >
                        <div class="text-center">
                          <button
                            type="button"
                            aria-expanded={showAllComponents}
                            class="text-primary text-xs underline"
                            onclick={() => {
                              showAllComponents = !showAllComponents
                              if (!showAllComponents) activeField = null
                            }}
                          >
                            {showAllComponents
                              ? m.association_hide_unused()
                              : m.association_edit_details()}
                          </button>
                        </div>
                      </div>
                      <div class="min-w-0 space-y-2">
                        {@render nameEditor()}
                      </div>
                    </div>
                    <div class="space-y-3">
                      {#each reviewGroups as group (group)}
                        <div
                          transition:slide={{
                            duration: prefersReducedMotion.current ? 0 : 200,
                          }}
                          class="grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-stretch gap-x-2 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)]"
                        >
                          {@render comparisonCell(originalAddress, group, 'original')}
                          <div class="flex flex-col items-center justify-center gap-1">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={choices[group] === 'original'}
                              aria-label={m.association_switch({
                                field: groupLabel(group),
                              })}
                              class="border-border text-primary hover:bg-primary/10 focus-visible:outline-primary flex size-8 items-center justify-center rounded-full border focus-visible:outline-2"
                              onclick={() => {
                                if (choices)
                                  choices[group] =
                                    choices[group] === 'original'
                                      ? 'location'
                                      : 'original'
                                resetGroup(group)
                              }}
                            >
                              {#if choices[group] === 'original'}
                                <ArrowLeftIcon class="size-4" />
                              {:else}
                                <ArrowRightIcon class="size-4" />
                              {/if}
                            </button>
                            <button
                              type="button"
                              aria-label={(groupIsEdited(group)
                                ? m.association_reset_field
                                : m.association_edit_field)({
                                field: groupLabel(group),
                              })}
                              class="text-primary flex items-center gap-1 text-[10px] underline"
                              onclick={() =>
                                groupIsEdited(group)
                                  ? resetGroup(group)
                                  : editGroup(group)}
                            >
                              {groupIsEdited(group)
                                ? m.forms__reset()
                                : m.forms__edit()}
                            </button>
                          </div>
                          {@render comparisonCell(matched.address, group, 'location')}
                        </div>
                      {/each}
                    </div>
                  {:else}
                    {#if editingFields}
                      <div class="flex justify-end">
                        <button
                          type="button"
                          aria-pressed={translations}
                          aria-label={m.location_address_languages()}
                          class="text-muted-foreground hover:bg-muted focus-visible:outline-primary inline-flex items-center gap-2 rounded px-2 py-1 text-xs focus-visible:outline-2"
                          onclick={() => (translations = !translations)}
                        >
                          <LanguagesIcon class="size-4" />
                          {m.location_address_languages()}
                        </button>
                      </div>
                    {/if}
                    {@render nameEditor(true)}
                  {/if}
                  {#if !numberValid}
                    <p role="alert" class="text-destructive text-sm">
                      {m.association_invalid_number()}
                    </p>
                  {/if}
                  {#if !sameRecord(origin, matched) &&
                    (distance > 0 || editingPin || Object.keys(customPins).length)}
                    <AssociationMarkerChoice
                      origin={pinPreview(origin)}
                      location={pinPreview(matched)}
                      {distance}
                      markerNumberFor={associationMarkerNumber}
                      onHighlight={id => (hoveredCandidate = id)}
                      onSelect={selectPin}
                      onEdit={editPin}
                      onReset={resetPin}
                      editing={editingPin === selectedPin.id}
                      originalCustom={Boolean(customPins[origin.id])}
                      locationCustom={Boolean(customPins[matched.id])}
                      bind:moveMarker
                    />
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
  {#if (!matched && ghost) || kind === 'address' || (matched && comparingRecords)}
    <footer
      class="bg-panel shrink-0 space-y-3 px-4 pt-3 pb-6 sm:px-6"
      data-association-footer
    >
      {#key viewPhase}
        <div
          in:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}
          class="space-y-3"
        >
          {#if !matched && ghost}
            <section
              class="border-primary/40 bg-primary/5 mx-auto grid w-full max-w-3xl min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-dashed p-3"
              data-association-ghost
              data-tooltip={m.association_ghost_help()}
            >
              <div class="min-w-0 space-y-1">
                <p class="text-xs font-semibold break-words whitespace-normal">
                  {ghost.names[tag] || Object.values(ghost.names).find(Boolean)}
                </p>
                <p
                  class="text-muted-foreground text-[10px] break-words whitespace-normal"
                >
                  {getAddressDisplay(ghost.address, getLocaleKey())}
                </p>
              </div>
              <button
                type="button"
                class="bg-primary focus-visible:outline-primary col-span-2 justify-self-end rounded-md px-3 py-2 text-xs font-medium text-white focus-visible:outline-2 sm:col-span-1 sm:self-center"
                onclick={() => {
                  if (visibleProvisional) {
                    custom = true
                    void tick().then(() => accept())
                  } else chooseCustom()
                }}
              >
                {visibleProvisional
                  ? m.association_use_location()
                  : {
                      premises: m.association_create_premises,
                      building: m.association_create_building,
                      building_part: m.association_create_building_part,
                      infrastructure: () => 'Create infrastructure',
                      street: () => 'Create street',
                      natural: () => 'Create geographic feature',
                      built: () => 'Create built',
                      structure: () => 'Create structure',
                      landform: () => 'Create landform',
                      coastal_feature: () => 'Create coastal feature',
                      water_feature: () => 'Create water feature',
                      service_point: () => 'Create service point',
                      establishment: m.association_create_establishment,
                    }[kind === 'address' ? 'establishment' : kind]()}
              </button>
            </section>
          {/if}
          {#if kind === 'building_part' && !matched?.identity && projectId}
            <BuildingPartParents
              {projectId}
              address={originalAddress}
              bind:buildingId
              bind:parentPartId
            />
          {/if}
          <div
            class="mx-auto w-full max-w-[45rem] items-center gap-3 {matched &&
            comparingRecords
              ? 'grid grid-cols-2'
              : 'flex justify-center'}"
            data-association-actions
          >
            {#if matched && comparingRecords}
              <button
                type="button"
                class="text-primary hover:bg-primary/10 focus-visible:outline-primary col-start-1 row-start-1 max-w-full justify-self-end rounded-md px-3 py-2 text-center text-sm font-medium break-words whitespace-normal focus-visible:outline-2 sm:px-4"
                onclick={acceptInitialSelection}
              >
                {m.association_use_initial()}
              </button>
            {/if}
            {#if kind === 'address' || (matched && comparingRecords)}
              <button
                type="button"
                disabled={!canAccept}
                class="bg-primary col-start-2 row-start-1 max-w-full justify-self-start rounded-md px-3 py-2 text-center text-sm font-medium break-words whitespace-normal text-white disabled:opacity-40 sm:px-4"
                onclick={() => accept(kind === 'address')}
              >
                {matched && comparingRecords
                  ? m.association_use_recommended()
                  : m.association_use_location()}
              </button>
            {/if}
          </div>
        </div>
      {/key}
    </footer>
  {/if}
</section>
