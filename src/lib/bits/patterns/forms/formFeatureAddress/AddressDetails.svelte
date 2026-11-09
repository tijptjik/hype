<script lang="ts">
// ADDRESS LOCALES
import { addressLocaleLabel } from './addressLocaleLabel.js'
// SVELTE
import { onMount, onDestroy, tick, type Snippet } from 'svelte'
import { slide, type SlideParams, type TransitionConfig } from 'svelte/transition'
import { flip } from 'svelte/animate'
import { cubicInOut } from 'svelte/easing'
import { MediaQuery } from 'svelte/reactivity'
// I18N
import { getLocaleKey, m, translateText, toLocaleKey } from '#lib/i18n.js'
// COMPONENTS
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import {
  displayedLocales,
  shortLocaleLabel,
} from '#lib/bits/custom/localeControls/localeControls.js'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import { contentLocaleOptions } from '../contentLocaleDefaults/contentLocaleOptions.js'
import type { ProfileLocaleState } from '../featureLocation/profileLocales.js'
import { reverseTabStop } from '#lib/bits/custom/form/reverseTabStop.js'
import LocationAssociationStatus from '../featureLocation/LocationAssociationStatus.svelte'
import DraftLocationAccessibility from '../featureLocation/DraftLocationAccessibility.svelte'
import LocationAccessibility from '../featureLocation/LocationAccessibility.svelte'
// API
import { getLocationAccessibility } from '#lib/api/locationAccessibility.remote.js'
// COMPONENTS
import FormI18nSourceBar from '../formI18nSection/components/FormI18nSourceBar.svelte'
import FormI18nInlineRow from '../formI18nSection/components/FormI18nInlineRow.svelte'
import FormI18nTranslationBar from '../formI18nSection/components/FormI18nTranslationBar.svelte'
import AddressNamePicker from './AddressNamePicker.svelte'
import { animateAddressColumns } from './animateAddressColumns.js'
import { adaptivePlaceholder } from './adaptivePlaceholder.js'
import {
  phaseEditorValue,
  setPhaseEditorValue,
  validPhaseReference,
  type PhaseEditorType,
} from '#lib/addresses/phaseEditor.js'
import { parseStreetNumber, streetNumberIssue } from '#lib/addresses/streetNumber.js'
import {
  completeStreetNames,
  loadAddressNames,
  setAddressName,
} from '#lib/addresses/nameCatalogue.js'
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
import AddressDisplayField from './AddressDisplayField.svelte'
import { ADDRESS_BLOCK_TYPES } from '@saanseoi/address/content'
import AddressBlocks from './AddressBlocks.svelte'
import { Button } from '#lib/bits/core/index.js'
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
// ICONS
import SearchIcon from 'virtual:icons/lucide/search'
import LoaderIcon from 'virtual:icons/lucide/loader-circle'
import UnitIcon from 'virtual:icons/lucide/door-open'
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
import SwapIcon from 'virtual:icons/lucide/arrow-left-right'
import XIcon from 'virtual:icons/lucide/x'
import InfoIcon from 'virtual:icons/lucide/info'
import WarningIcon from 'virtual:icons/lucide/triangle-alert'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import PanelLeftIcon from 'virtual:icons/lucide/panel-left'
// ADDRESS
import { fillBuildingDetails } from '#lib/addresses/buildingSelection.js'
import {
  loadBuildingDetails,
  type BuildingDetails,
  type BuildingAddressCandidate,
} from '#lib/sources/saanseoi.js'
import type { AddressName } from '#lib/addresses/nameCatalogue.js'
import {
  ADDRESS_LOCALES,
  emptyFeatureAddress,
  getAddressDisplay,
  getAddressLocale,
  getAddressPresentationLocale,
  setAddressOverride,
} from '#lib/addresses/featureAddress.js'
import { addressComponentValue } from '#lib/addresses/presentation.js'
import {
  EDITABLE_ADDRESS_FIELDS,
  resetAddressComponent,
  clearAddressComponent,
  setAddressBlock,
  parseBlockReference,
  addressBlockTypeLabel,
  getExpressionSuggestions,
  setAddressExpression,
  setStructuredAddressExpression,
  getStructuredAddressType,
  addressUnitReference,
  addressFloorReference,
  setAddressFloorReference,
  customAddressType,
  setCustomAddressUnit,
} from '#lib/addresses/addressExpressions.js'
import {
  FLOOR_TYPES,
  UNIT_TYPES,
  parseUnitReference,
  parseFloorReference,
  FloorTypeSchema,
  UnitTypeSchema,
  floorTerms,
  unitTerms,
  addressTerm,
} from '#lib/addresses/address3d.js'
// TYPES
import type { AccessibilityDraft } from '#lib/locations/accessibility.js'
import type { AddressDivision } from '#lib/addresses/divisions.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { BuildingSource } from '#lib/locations/buildingSource.js'
import type { EditableAddressField } from '#lib/addresses/addressExpressions.js'
import type { Locale, LocaleKey } from '#lib/types.js'
import type { FloorType } from '#lib/addresses/address3d.js'

let {
  address,
  localeState,
  onLocaleStateChange,
  activeBuildingSource,
  activeLocationNames = {},
  isLocationReplacementDraft = false,
  onMakeBuildingActive,
  onBuildingNameBlur,
  onSuggestStreetNumber,
  suggestionKey = '',
  locationKind,
  identityFields,
  identityControls,
  identityInfo,
  divisions = [],
  isEditing = false,
  show3dAddressOptions = true,
  showAccessHints = true,
  accessibilityLocationId,
  accessibilityDraft,
  accessibilityDraftKey,
  onAccessibilityDraftChange,
  hasLocation = true,
  hideDisplayAddress = false,
  splitColumns = false,
  independentScroll = false,
  translations = $bindable(false),
  hasAvailableParts = $bindable(true),
  minimumEditorWidth = $bindable(560),
  partsOpen = true,
  partsOverlay = false,
  onToggleParts,
  onLookup,
  isLookupLoading = false,
  onChange,
}: {
  address: FeatureAddress
  localeState?: ProfileLocaleState
  onLocaleStateChange?: (state: ProfileLocaleState) => void
  activeBuildingSource?: BuildingSource
  activeLocationNames?: Record<string, string>
  isLocationReplacementDraft?: boolean
  onMakeBuildingActive?: (selection: {
    source: BuildingSource
    address: FeatureAddress
    names: Record<string, string>
  }) => void
  onBuildingNameBlur?: () => void
  onSuggestStreetNumber?: () => Promise<string | null>
  suggestionKey?: string
  locationKind?: string
  identityFields?: Snippet<[boolean]>
  identityControls?: Snippet
  identityInfo?: Snippet
  divisions?: AddressDivision[]
  isEditing?: boolean
  show3dAddressOptions?: boolean
  showAccessHints?: boolean
  accessibilityLocationId?: string
  accessibilityDraft?: AccessibilityDraft
  accessibilityDraftKey?: string
  onAccessibilityDraftChange?: (value: AccessibilityDraft | undefined) => void
  hasLocation?: boolean
  hideDisplayAddress?: boolean
  splitColumns?: boolean
  independentScroll?: boolean
  translations?: boolean
  hasAvailableParts?: boolean
  minimumEditorWidth?: number
  partsOpen?: boolean
  partsOverlay?: boolean
  onToggleParts?: () => void
  onLookup?: () => void
  isLookupLoading?: boolean
  onChange: (address: FeatureAddress) => void
} = $props()
/** Collapse locale rows and their own spacing as one continuous motion.
 * @param node Locale row or translated display group. @param options Shared motion duration.
 * @returns A slide that releases minimum height so the row can shrink all the way to zero.
 */
function localeSlide(node: Element, options: SlideParams): TransitionConfig {
  const transition = slide(node, { ...options, easing: cubicInOut })
  return {
    ...transition,
    css: (t, u) => `${transition.css?.(t, u) ?? ''};min-height:0;`,
  }
}
let translationActive = true
let translationGeneration = 0
onDestroy(() => {
  translationActive = false
})
$effect(() => {
  // Closing editing permanently retires requests from that editing session.
  if (!isEditing) translationGeneration += 1
})
const prefersReducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)')
const locales = ['en', 'zhHant', 'zhHans'] as const
let addedFields = $state<EditableAddressField[]>([])
let numberRequest = 0
let numberInput = $state<HTMLInputElement | null>(null)
const numberIssue = $derived(streetNumberIssue(address.overrides.en ?? {}))
const numberError = $derived(
  numberIssue === 'descending'
    ? m.address_number_descending()
    : numberIssue
      ? m.address_number_invalid()
      : '',
)
$effect(() => {
  numberInput?.setCustomValidity(numberError)
})
/** Normalize a complete number after the input's own blur/trim processing has settled.
 * @param input Edited number control. @param locale Current editor language.
 * @returns Nothing; malformed entries remain visible and block submission.
 */
function normalizeNumber(input: HTMLInputElement, locale: LocaleKey): void {
  void tick().then(() => {
    if (!input.isConnected) return
    const parsed = parseStreetNumber(input.value)
    if (parsed.valid)
      onChange(
        setAddressExpression(
          address,
          locale,
          'buildingNumberExpression',
          parsed.number.expression,
        ),
      )
  })
}
let numberCaveat = $state<{ value: string; key: string } | null>(null)
onDestroy(() => {
  numberRequest++
})
/** Adds an optional field, suggesting a map number only while the same empty draft remains active.
 * @param field Requested address part. @returns Resolves after optional map lookup.
 */
async function addField(field: EditableAddressField): Promise<void> {
  addedFields = [...addedFields, field]
  if (field !== 'buildingNumberExpression' || !onSuggestStreetNumber) return
  const request = ++numberRequest
  const key = suggestionKey
  const source = JSON.stringify(address.source)
  try {
    const number = await onSuggestStreetNumber()
    if (
      !number ||
      request !== numberRequest ||
      key !== suggestionKey ||
      source !== JSON.stringify(address.source) ||
      !isEditing ||
      !addedFields.includes(field) ||
      locales.some(locale => addressComponentValue(address, locale, field).trim())
    )
      return
    onChange(setAddressExpression(address, getLocaleKey(), field, number))
    numberCaveat = { value: number, key }
  } catch {
    /* Map availability must not prevent manual address entry. */
  }
}
let accessibilityAdded = $state(false)
let accessibilityDismissed = $state(false)
const accessibilityRequest = $derived(
  accessibilityLocationId
    ? getLocationAccessibility({ locationId: accessibilityLocationId })
    : null,
)
const hasAccessibility = $derived(
  Boolean(
    (accessibilityRequest?.current?.record &&
      Object.values(accessibilityRequest.current.record.values).some(
        value => value !== 'unknown',
      )) ||
      accessibilityRequest?.current?.venues.length,
  ),
)
const accessibilityVisible = $derived(
  !accessibilityDismissed &&
    Boolean(
      (accessibilityLocationId && (accessibilityAdded || hasAccessibility)) ||
        (onAccessibilityDraftChange && accessibilityDraft !== undefined),
    ),
)
const canAddAccessibility = $derived(
  Boolean(
    (accessibilityRequest?.current || onAccessibilityDraftChange) &&
      !accessibilityVisible,
  ),
)
// Adding a part changes only this editor; navigating to another Location cannot carry an unsaved panel across.
$effect(() => {
  accessibilityLocationId
  accessibilityDraftKey
  accessibilityAdded = false
  accessibilityDismissed = false
})
/** Reveal the shared fields in the address editor.
 * @returns Nothing; adding fields preserves the current editor scroll position.
 */
function addAccessibility(): void {
  accessibilityAdded = true
  accessibilityDismissed = false
  onAccessibilityDraftChange?.(accessibilityDraft ?? {})
}
let buildingRequest = 0
onDestroy(() => {
  buildingRequest++
})
let buildingLoading = $state(false)
let buildingFailed = $state(false)
let buildingSelection = $state<{
  name: AddressName
  source: BuildingSource
  details: BuildingDetails
  locale: LocaleKey
  streets: AddressName[]
  mismatch: boolean
  currentName: string
} | null>(null)
let selectedBuilding = $state<{
  source: BuildingSource
  address?: FeatureAddress
  names: Record<string, string>
  selectedName: string
  mismatch: boolean
  currentName: string
  needsAddress: boolean
} | null>(null)
$effect(() => {
  const selected = selectedBuilding
  if (!selected?.mismatch) return
  const sourceMatches = activeBuildingSource?.id === selected.source.id
  const selectedNames = new Set(
    Object.values(selected.names).map(normalizeNameSearch).filter(Boolean),
  )
  const draftNamesMatch =
    isLocationReplacementDraft &&
    Object.values(activeLocationNames)
      .map(normalizeNameSearch)
      .some(name => selectedNames.has(name))
  if (sourceMatches || draftNamesMatch)
    selectedBuilding = { ...selected, mismatch: false }
})
/** Compare a catalogue selection with retained identity, then fall back to current address names.
 * @param record Selected catalogue name. @param details Release-pinned address candidates.
 * @param previous Address before applying the selection.
 * @returns Whether the available evidence says the selected building differs from this Location.
 */
function buildingDiffersFromLocation(
  record: AddressName,
  details: BuildingDetails,
  previous: FeatureAddress,
): boolean {
  if (activeBuildingSource) return activeBuildingSource.id !== record.id
  if (previous.source.address2dId && details.addresses.length)
    return !details.addresses.some(
      candidate => candidate.id === previous.source.address2dId,
    )
  const selectedNames = new Set(
    [record.name, ...Object.values(record.names)]
      .map(name => normalizeNameSearch(name ?? ''))
      .filter(Boolean),
  )
  const previousBuildingNames = (Object.keys(ADDRESS_LOCALES) as LocaleKey[]).map(
    locale => String(getAddressPresentationLocale(previous, locale).buildingName ?? ''),
  )
  const referenceNames = [
    ...previousBuildingNames,
    ...(locationKind === 'building' ? Object.values(activeLocationNames) : []),
  ]
    .map(normalizeNameSearch)
    .filter(Boolean)
  return Boolean(
    referenceNames.length &&
      selectedNames.size &&
      !referenceNames.some(name => selectedNames.has(name)),
  )
}

/** Choose the clearest available label for the Location named by the existing evidence.
 * @param previous Address before selecting another building.
 * @returns Current Location name for the warning.
 */
function currentBuildingLabel(previous: FeatureAddress): string {
  const locale = ADDRESS_LOCALES[getLocaleKey()]
  const locationName =
    locationKind === 'building'
      ? activeLocationNames[locale] || Object.values(activeLocationNames).find(Boolean)
      : undefined
  if (locationName) return locationName
  return (
    (Object.keys(ADDRESS_LOCALES) as LocaleKey[])
      .map(key =>
        String(getAddressPresentationLocale(previous, key).buildingName ?? '').trim(),
      )
      .find(Boolean) ?? ''
  )
}
/** Resolve an explicit building choice without allowing a late response to replace a newer selection.
 * @param record Selected building, or null to clear. @param locale Active editor language.
 * @returns Completion after detail projection resolution.
 */
async function selectBuilding(
  record: AddressName | null,
  locale: LocaleKey,
): Promise<void> {
  const request = ++buildingRequest
  buildingSelection = null
  selectedBuilding = null
  buildingFailed = false
  const release = record?.release
  buildingLoading = Boolean(release)
  const previous = address
  const selectedAddress = setAddressName(address, 'buildingName', record)
  const selectionSignature = (draft: FeatureAddress): string =>
    JSON.stringify(
      Object.keys(ADDRESS_LOCALES).map(
        key => getAddressLocale(draft, key as LocaleKey).buildingName,
      ),
    )
  const expectedSelection = selectionSignature(selectedAddress)
  onChange(selectedAddress)
  if (!record || !release) return
  try {
    const [details, streets] = await Promise.all([
      loadBuildingDetails(record.id, release),
      loadAddressNames('streets').catch(() => []),
    ])
    if (
      request !== buildingRequest ||
      selectionSignature(address) !== expectedSelection
    )
      return
    const mismatch = buildingDiffersFromLocation(record, details, previous)
    const currentName = currentBuildingLabel(previous)
    const names = {
      ...record.names,
      ...(record.name ? { und: record.name } : {}),
    }
    const candidate = details.addresses.length === 1 ? details.addresses[0] : undefined
    const source = {
      id: record.id,
      release,
      ...(candidate ? { addressId: candidate.id } : {}),
    }
    buildingSelection = {
      name: record,
      source: { id: record.id, release },
      details,
      locale,
      streets,
      mismatch,
      currentName,
    }
    selectedBuilding = {
      source,
      address:
        details.addresses.length > 1
          ? undefined
          : fillBuildingDetails(
              emptyFeatureAddress(),
              record,
              details,
              candidate,
              false,
              locale,
              streets,
            ),
      names,
      selectedName:
        record.names[ADDRESS_LOCALES[locale]] ||
        record.name ||
        Object.values(record.names).find(Boolean) ||
        m.address_section_building(),
      mismatch,
      currentName,
      needsAddress: details.addresses.length > 1,
    }
    onChange(
      fillBuildingDetails(
        address,
        record,
        details,
        candidate,
        hasLocation,
        locale,
        streets,
      ),
    )
  } catch {
    if (request === buildingRequest) buildingFailed = true
  } finally {
    if (request === buildingRequest) buildingLoading = false
  }
}
/** Apply one of multiple published spatial candidates while retaining all existing edits.
 * @param candidate Explicit address choice. @returns Nothing.
 */
function chooseBuildingAddress(candidate: BuildingAddressCandidate): void {
  if (!buildingSelection) return
  const { name, source, details, locale, streets, mismatch, currentName } =
    buildingSelection
  const next = fillBuildingDetails(
    address,
    name,
    details,
    candidate,
    hasLocation,
    locale,
    streets,
  )
  onChange(next)
  selectedBuilding = {
    source: {
      ...source,
      addressId: candidate.id,
    },
    address: fillBuildingDetails(
      emptyFeatureAddress(),
      name,
      details,
      candidate,
      false,
      locale,
      streets,
    ),
    names: {
      ...name.names,
      ...(name.name ? { und: name.name } : {}),
    },
    selectedName:
      name.names[ADDRESS_LOCALES[locale]] ||
      name.name ||
      Object.values(name.names).find(Boolean) ||
      m.address_section_building(),
    mismatch,
    currentName,
    needsAddress: false,
  }
  buildingSelection = null
}

/** Start Location association from the resolved catalogue building selection.
 * @returns Nothing; association review owns the next confirmation.
 */
function makeSelectedBuildingActive(): void {
  if (!selectedBuilding?.address || selectedBuilding.needsAddress) return
  onMakeBuildingActive?.({
    source: selectedBuilding.source,
    address: selectedBuilding.address,
    names: selectedBuilding.names,
  })
}
// Address selectors use the neutral menu surface, including the portalled viewport and options.
const addressSelectContentClass =
  'bg-panel! [&>div]:bg-transparent! [&_[role=option]]:bg-transparent! [&_[role=option][data-highlighted]]:bg-foreground/5! [&_[role=option][data-state=checked]]:bg-foreground/5!'
const uid = $props.id()
let accessHintBeforeEdit = $state<Partial<Record<string, string>>>({})
let replacingNames = $state<Record<string, boolean>>({})
let activeBlockLocale = $state<LocaleKey | null>(null)
let typeOverrides = $state<Record<string, boolean>>({})
let phaseTypes = $state<Record<string, PhaseEditorType>>({})
let phaseDrafts = $state<Record<string, string | undefined>>({})
const phaseTimers = new Map<LocaleKey, ReturnType<typeof setTimeout>>()
onDestroy(() => phaseTimers.forEach(clearTimeout))
/** Explain a phase conversion without blocking or dropping the user's text.
 * @param locale Edited locale. @param message Conversion explanation. @returns Nothing.
 */
function explainPhase(locale: LocaleKey, message: string): void {
  const key = `${locale}-phaseExpression`
  referenceNotice[key] = message
  referenceNoticeOpen[key] = true
  clearTimeout(noticeTimers.get(key))
  noticeTimers.set(
    key,
    setTimeout(() => {
      referenceNoticeOpen[key] = false
      referenceNotice[key] = ''
    }, 5000),
  )
}
/** Accept free typing, reserving extraction for complete Phase/Stage words after a pause.
 * @param value Typed text. @param locale Edited language. @returns Nothing; updates the draft and schedules normalization.
 */
function editPhase(value: string, locale: LocaleKey): void {
  clearTimeout(phaseTimers.get(locale))
  let type = phaseTypes[locale] ?? phaseEditorValue(address, locale).type
  phaseDrafts[locale] = value
  if (type !== 'named' && !validPhaseReference(value)) {
    type = 'named'
    phaseTypes[locale] = type
    explainPhase(locale, m.address_phase_switched_to_name())
  }
  if (locale !== 'en' && type !== 'named') {
    const other = locale === 'zhHant' ? 'zhHans' : 'zhHant'
    if (phaseEditorValue(address, other).type !== 'named') {
      phaseDrafts[other] = value
      clearTimeout(phaseTimers.get(other))
    }
  }
  onChange(setPhaseEditorValue(address, locale, type, value))
  phaseTimers.set(
    locale,
    setTimeout(() => {
      const match = /^(Phase|Stage)(?:\s+(.+))?$/i.exec(value.trim())
      if (!match || !validPhaseReference(match[2] ?? '')) return
      const inferred = match[1].toLowerCase() as 'phase' | 'stage'
      phaseTypes[locale] = inferred
      phaseDrafts[locale] = match[2] ?? ''
      if (locale !== 'en') {
        const other = locale === 'zhHant' ? 'zhHans' : 'zhHant'
        if (phaseEditorValue(address, other).type !== 'named')
          phaseDrafts[other] = phaseDrafts[locale]
      }
      onChange(setPhaseEditorValue(address, locale, inferred, phaseDrafts[locale]!))
      explainPhase(locale, m.address_floor_type_inferred({ type: match[1] }))
    }, 650),
  )
}
/** Sync primary-language type choices while retaining explicit secondary-language choices.
 * @param field Typed component. @param locale Edited locale. @param type Chosen form type.
 * @returns Nothing; commits a coherent multilingual draft.
 */
function chooseLocalizedType(
  field: 'blockExpression' | 'phaseExpression',
  locale: LocaleKey,
  type: string,
): void {
  if (locale !== getLocaleKey()) typeOverrides[`${locale}-${field}`] = true
  let next = address
  for (const target of locale === getLocaleKey() ? locales : [locale]) {
    if (target !== locale && typeOverrides[`${target}-${field}`]) continue
    if (field === 'blockExpression') {
      const block = getAddressPresentationLocale(next, target)
      next = setAddressBlock(
        next,
        target,
        type,
        String(block.blockRef ?? ''),
        block.blockTypeBeforeNumber === true ||
          (block.blockTypeBeforeNumber == null && target === 'en'),
      )
    } else {
      const current = phaseEditorValue(next, target)
      clearTimeout(phaseTimers.get(target))
      phaseDrafts[target] = undefined
      const effectiveType =
        type !== 'named' && !validPhaseReference(current.value)
          ? 'named'
          : (type as PhaseEditorType)
      phaseTypes[target] = type as PhaseEditorType
      // Let the select commit its choice before reflecting a text-preserving fallback.
      if (effectiveType !== type)
        void tick().then(() => {
          phaseTypes[target] = effectiveType
        })
      next = setPhaseEditorValue(next, target, effectiveType, current.value)
      if (effectiveType !== type)
        explainPhase(target, m.address_phase_switched_to_name())
    }
  }
  onChange(next)
}
let explicitFloorType = $state<FloorType | undefined>()
let floorDraft = $state<string | undefined>()
let floorNotice = $state('')
let floorNoticeOpen = $state(false)
let floorInputTimer: ReturnType<typeof setTimeout> | undefined
let floorNoticeTimer: ReturnType<typeof setTimeout> | undefined
onDestroy(() => {
  clearTimeout(floorInputTimer)
  clearTimeout(floorNoticeTimer)
})
/** Resolve a paused or completed floor entry, keeping only its reference in the input.
 * @param locale Edited language. @returns Nothing; updates the composed expression and explains extracted terms.
 */
function normalizeFloorInput(locale: LocaleKey): void {
  clearTimeout(floorInputTimer)
  if (floorDraft === undefined) return
  const parsed = parseFloorReference(
    floorDraft,
    FloorTypeSchema.parse(getStructuredAddressType(address, 'floorExpression')),
  )
  explicitFloorType = parsed.floorType
  floorDraft = parsed.floorRef
  onChange(setAddressFloorReference(address, parsed.floorRef, parsed.floorType))
  if (parsed.extracted) {
    floorNotice = m.address_floor_type_inferred({
      type: addressTerm(floorTerms[parsed.floorType], locale),
    })
    floorNoticeOpen = true
    clearTimeout(floorNoticeTimer)
    floorNoticeTimer = setTimeout(() => {
      floorNoticeOpen = false
      floorNotice = ''
    }, 5000)
  }
}
let referenceDrafts = $state<Record<string, string | undefined>>({})
let referenceNotice = $state<Record<string, string>>({})
let referenceNoticeOpen = $state<Record<string, boolean>>({})
const referenceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const noticeTimers = new Map<string, ReturnType<typeof setTimeout>>()
onDestroy(() => {
  referenceTimers.forEach(clearTimeout)
  noticeTimers.forEach(clearTimeout)
})
/** Normalize unit/block entries after a pause or blur, with a brief explanation.
 * @param field Reference field. @param locale Edited language. @returns Nothing.
 */
function normalizeReference(
  field: 'unitExpression' | 'blockExpression',
  locale: LocaleKey,
): void {
  const key = `${locale}-${field}`
  clearTimeout(referenceTimers.get(key))
  const raw = referenceDrafts[key]
  if (raw === undefined) return
  let label = ''
  if (field === 'unitExpression') {
    const parsed = parseUnitReference(
      raw,
      UnitTypeSchema.parse(getStructuredAddressType(address, field)),
    )
    referenceDrafts[key] = parsed.unitRef
    onChange(
      setStructuredAddressExpression(
        address,
        locale,
        field,
        parsed.unitRef,
        parsed.unitType,
      ),
    )
    if (parsed.extracted) label = addressTerm(unitTerms[parsed.unitType], locale)
  } else {
    const block = getAddressPresentationLocale(address, locale)
    const parsed = parseBlockReference(raw, String(block.blockType || 'block'))
    referenceDrafts[key] = parsed.blockRef
    if (locale !== 'en') {
      const otherKey = `${locale === 'zhHant' ? 'zhHans' : 'zhHant'}-${field}`
      referenceDrafts[otherKey] = parsed.blockRef
      clearTimeout(referenceTimers.get(otherKey))
    }
    onChange(
      setAddressBlock(
        address,
        locale,
        parsed.blockType,
        parsed.blockRef,
        block.blockTypeBeforeNumber === true ||
          (block.blockTypeBeforeNumber == null && locale === 'en'),
      ),
    )
    if (parsed.extracted) label = addressBlockTypeLabel(parsed.blockType, locale)
  }
  if (label) {
    referenceNotice[key] = m.address_floor_type_inferred({ type: label })
    referenceNoticeOpen[key] = true
    clearTimeout(noticeTimers.get(key))
    noticeTimers.set(
      key,
      setTimeout(() => {
        referenceNoticeOpen[key] = false
        referenceNotice[key] = ''
      }, 5000),
    )
  }
}
const labels = $derived<Record<EditableAddressField, string>>({
  formattedAddress: m.feature_address_formattedAddress(),
  buildingName: m.feature_address_buildingName(),
  buildingNumberExpression: m.feature_address_buildingNumberExpression(),
  blockExpression: m.feature_address_blockExpression(),
  phaseExpression: m.feature_address_phaseExpression(),
  premisesName: m.feature_address_premisesName(),
  streetName: m.feature_address_streetName(),
  floorExpression: m.feature_address_floorExpression(),
  unitExpression: m.feature_address_unitExpression(),
  unitPortion: m.feature_address_unitPortion(),
  accessHint: m.feature_address_accessHint(),
})
const availableFields = $derived(
  EDITABLE_ADDRESS_FIELDS.filter(
    field =>
      (!hideDisplayAddress || field !== 'formattedAddress') &&
      (showAccessHints || field !== 'accessHint') &&
      (show3dAddressOptions ||
        !['floorExpression', 'unitExpression', 'unitPortion'].includes(field)),
  ),
)
const visibleFields = $derived(
  availableFields.filter(
    field =>
      field === 'formattedAddress' ||
      (field === 'buildingName' &&
        Boolean(identityFields) &&
        locationKind === 'establishment') ||
      addedFields.includes(field) ||
      Object.keys(address.overrides).some(
        tag => !addressLocaleKey(tag) && Boolean(additionalLocaleValue(tag, field)),
      ) ||
      (field === 'accessHint' &&
        Object.values(address.accessHints ?? {}).some(value => value?.trim())) ||
      locales.some(
        locale =>
          Boolean(addressComponentValue(address, locale, field)) ||
          (!['buildingName', 'streetName'].includes(field) &&
            Object.hasOwn(address.overrides[ADDRESS_LOCALES[locale]] ?? {}, field) &&
            address.overrides[ADDRESS_LOCALES[locale]]?.[field] !== null),
      ),
  ),
)
$effect(() => {
  hasAvailableParts =
    visibleFields.length < availableFields.length || canAddAccessibility
})
const addableAddressParts = $derived(
  availableFields.filter(
    field => field !== 'accessHint' && !visibleFields.includes(field),
  ),
)
const canAddAccessHint = $derived(
  availableFields.includes('accessHint') && !visibleFields.includes('accessHint'),
)
const examples = {
  formattedAddress: m.address_example_display,
  unitPortion: m.address_example_portion,
  unitExpression: m.address_example_unit,
  floorExpression: m.address_example_floor,
  blockExpression: m.address_example_block,
  phaseExpression: m.address_example_phase,
  premisesName: m.address_example_premises,
  buildingName: m.address_example_building,
  buildingNumberExpression: m.address_example_number,
  streetName: m.address_example_street,
  accessHint: m.address_example_access,
}
let localLocaleState = $state<ProfileLocaleState>({
  selectedLocales: ['en', 'zh-Hant', 'zh-Hans'],
  visibleLocales: ['en', 'zh-Hant', 'zh-Hans'],
  expanded: false,
})
const addressLocaleState = $derived(localeState ?? localLocaleState)
const contentLocales = $derived(
  normalizeContentLocales([
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
  normalizeContentLocales([...addressLocaleState.selectedLocales, ...contentLocales]),
)
const shownLocales = $derived(
  displayedLocales(
    {
      selectedLocales,
      visibleLocales: [
        ...addressLocaleState.visibleLocales,
        ...selectedLocales.filter(
          tag => !addressLocaleState.selectedLocales.includes(tag),
        ),
      ],
    },
    translations,
  ),
)
const activeLocales = $derived(
  shownLocales.flatMap(tag => {
    const key = addressLocaleKey(tag)
    return key ? [key] : []
  }),
)
/** Resolve structured address languages without treating other content languages as English.
 * @param tag Content language tag. @returns Supported structured locale, if present.
 */
function addressLocaleKey(tag: string): LocaleKey | undefined {
  return locales.find(key => ADDRESS_LOCALES[key] === tag.toLowerCase())
}
/** Accept shared form-local visibility and ordering.
 * @param state New locale state. @returns Nothing.
 */
function changeLocaleState(state: ProfileLocaleState): void {
  localLocaleState = state
  translations = state.expanded
  onLocaleStateChange?.(state)
}
/** Read additional content languages without borrowing another language's text.
 * @param tag Content language. @param field Address field. @returns Exact localized text.
 */
function additionalLocaleValue(tag: string, field: EditableAddressField): string {
  const key = tag.toLowerCase()
  if (field === 'accessHint') return address.accessHints?.[key] ?? ''
  const content =
    address.association?.content ??
    address.canonical?.content ??
    address.source.canonical?.content ??
    address.source.authored
  const raw = address.source.rawSource.data as
    | { attributes?: { i18n?: Record<string, Record<string, unknown>> } }
    | undefined
  const row = Object.entries(content?.i18n ?? raw?.attributes?.i18n ?? {}).find(
    ([locale]) => locale.toLowerCase() === key,
  )?.[1]
  const corrections = address.overrides[key] ?? {}
  const value = Object.hasOwn(corrections, field)
    ? corrections[field]
    : Object.entries(row ?? {}).find(([name]) => name === field)?.[1]
  return typeof value === 'string' ? value : ''
}
/** Store additional content languages as explicit draft corrections.
 * @param tag Content language. @param field Edited field. @param value Authored text.
 * @returns Nothing; source identity stays intact.
 */
function editAdditionalLocale(
  tag: string,
  field: EditableAddressField,
  value: string,
): void {
  const key = tag.toLowerCase()
  onChange(
    field === 'accessHint'
      ? {
          ...address,
          accessHints: { ...address.accessHints, [key]: value.trim() || null },
        }
      : setAddressOverride(address, key, field, value.trim() || null),
  )
}

/** Reserve reference-entry space beside intrinsic type selectors before the owning layout fits side panels.
 * @param node Editor root. @param signature Visible fields and selected labels. @returns Observer lifecycle.
 */
function measureEditorMinimum(
  node: HTMLElement,
  signature: string,
): { update: (signature: string) => void; destroy: () => void } {
  let frame = 0
  let disposed = false
  const measure = (): void => {
    const widths = [
      ...node.querySelectorAll<HTMLElement>(
        '#address-floorExpression-type, #address-unitExpression-type, #address-en-floorExpression, #address-en-unitExpression',
      ),
    ].map(element => element.getBoundingClientRect().width)
    // A 48px numeric reference plus its 8px gap stays usable without reserving a wide prose input.
    const required = Math.ceil(
      Math.max(560, widths.reduce((sum, width) => sum + width, 0) + 256),
    )
    if (minimumEditorWidth !== required) minimumEditorWidth = required
  }
  const schedule = (): void => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }
  const observer =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
  const update = (_signature: string): void => {
    void tick().then(() => {
      if (disposed) return
      observer?.disconnect()
      node
        .querySelectorAll<HTMLElement>(
          '#address-floorExpression-type, #address-unitExpression-type, input[id$="-floorExpression"], input[id$="-unitExpression"]',
        )
        .forEach(element => {
          observer?.observe(element)
        })
      schedule()
    })
  }
  update(signature)
  return {
    update,
    destroy: () => {
      disposed = true
      observer?.disconnect()
      cancelAnimationFrame(frame)
    },
  }
}
// Keep semantic rows separate when optional fields have not been added.
const fieldGroups: { fields: EditableAddressField[]; title?: () => string }[] = [
  { fields: ['formattedAddress'] },
  {
    fields: ['unitPortion', 'unitExpression', 'floorExpression'],
    title: () => m.address_section_unit_details(),
  },
  {
    fields: ['buildingName', 'blockExpression'],
    title: () => m.address_section_building(),
  },
  {
    fields: ['phaseExpression', 'premisesName'],
    title: () => m.address_section_premises(),
  },
  {
    fields: ['buildingNumberExpression', 'streetName'],
    title: () => m.address_section_street(),
  },
  { fields: ['accessHint'], title: () => m.address_section_accessibility() },
]
const visibleGroups = $derived(
  fieldGroups
    .map(group => ({
      ...group,
      fields: group.fields.filter(field => visibleFields.includes(field)),
    }))
    .filter(group => group.fields.length),
)
let streetCatalogue = $state<AddressName[]>([])
$effect(() => {
  if (!isEditing || !streetCatalogue.length) return
  const completed = completeStreetNames(address, streetCatalogue)
  if (completed !== address) onChange(completed)
})
// Warm both vocabularies when the address page loads, even before optional fields are enabled.
onMount(() => {
  for (const family of ['streets', 'buildings'] as const)
    void loadAddressNames(family)
      .then(rows => {
        if (translationActive && family === 'streets') streetCatalogue = rows
      })
      .catch(error => console.error(`Could not preload ${family} names`, error))
})
/** Translate the Part from one source into its empty languages without replacing edits made in flight.
 * @param source Source language selected beside the Part heading.
 * @returns Resolves after all missing translations have been applied together.
 */
async function translatePart(source: Locale): Promise<void> {
  const originalAddress = address
  const generation = translationGeneration
  const sourceKey = toLocaleKey(source)
  const text = addressComponentValue(address, sourceKey, 'unitPortion')
  const targets = activeLocales.filter(
    locale =>
      locale !== sourceKey &&
      !addressComponentValue(address, locale, 'unitPortion').trim(),
  )
  // Gather translations before updating the draft so a partial response cannot invalidate another target.
  const results = await Promise.all(
    targets.map(async locale => {
      const [translated] = await translateText(source, ADDRESS_LOCALES[locale], [text])
      return { locale, translated }
    }),
  )
  // Preserve any Part edits made while the translation was in flight.
  if (
    !translationActive ||
    !isEditing ||
    generation !== translationGeneration ||
    address !== originalAddress
  )
    return
  let next = address
  for (const { locale, translated } of results) {
    if (translated) next = setAddressExpression(next, locale, 'unitPortion', translated)
  }
  onChange(next)
}
/** Read the authored locale without display fallbacks, so missing translations remain editable targets.
 * @param locale Requested editor locale. @returns Its saved hint, or an empty string.
 */
function accessHintValue(locale: string): string {
  const key =
    addressLocaleKey(locale) ??
    (locales.includes(locale as LocaleKey) ? (locale as LocaleKey) : undefined)
  return address.accessHints?.[key ? ADDRESS_LOCALES[key] : locale.toLowerCase()] ?? ''
}
const accessHintSources = $derived(
  selectedLocales.filter(locale => accessHintValue(locale).trim()),
)
let accessHintTranslationSource = $state<string | null>(null)
let accessHintTranslationFailed = $state(false)

/** Translate access hints into every empty supported language from the selected source.
 * @param source Source language chosen in the shared translation bar.
 * @returns Resolves after applying the complete translation batch or exposing a retryable error.
 * @remarks Existing values and any draft changed during the request are preserved.
 */
async function translateAccessHints(source: string): Promise<void> {
  if (accessHintTranslationSource || !isEditing) return
  const text = accessHintValue(source)
  const targets = selectedLocales.filter(
    locale => locale !== source && !accessHintValue(locale).trim(),
  )
  if (!text.trim() || !targets.length) return
  const originalAddress = address
  const generation = translationGeneration
  accessHintTranslationSource = source
  accessHintTranslationFailed = false
  try {
    // Apply the batch together so one completed request cannot invalidate another target.
    const results = await Promise.all(
      targets.map(async locale => {
        const sourceKey = addressLocaleKey(source)
        const targetKey = addressLocaleKey(locale)
        let translated: string | undefined
        if (sourceKey && targetKey) {
          ;[translated] = await translateText(
            ADDRESS_LOCALES[sourceKey],
            ADDRESS_LOCALES[targetKey],
            [text],
          )
        } else {
          const { translateContentField } = await import(
            '#lib/api/translation.remote.js'
          )
          const result = await translateContentField({ source, target: locale, text })
          if (result.status === 'translated') translated = result.text
        }
        if (!translated?.trim()) throw new Error('Empty access hint translation')
        return { locale, translated }
      }),
    )
    if (
      !translationActive ||
      !isEditing ||
      generation !== translationGeneration ||
      address !== originalAddress
    )
      return
    let next = address
    for (const { locale, translated } of results)
      next = {
        ...next,
        accessHints: { ...next.accessHints, [locale.toLowerCase()]: translated },
      }
    onChange(next)
  } catch {
    if (
      translationActive &&
      isEditing &&
      generation === translationGeneration &&
      address === originalAddress
    )
      accessHintTranslationFailed = true
  } finally {
    accessHintTranslationSource = null
  }
}
/** Count intrinsic control columns shared by every language in an address group.
 * @param field Address field. @returns Number of aligned control tracks.
 */
function fieldColumns(field: EditableAddressField): number {
  return field === 'blockExpression' ? 3 : field === 'phaseExpression' ? 2 : 1
}

/** Resolve the localized block order, retaining the existing default for each language.
 * @param locale Address language. @returns Whether the type precedes the reference.
 */
function blockTypeFirst(locale: LocaleKey): boolean {
  const block = getAddressPresentationLocale(address, locale)
  return (
    block.blockTypeBeforeNumber === true ||
    (block.blockTypeBeforeNumber == null && locale === 'en')
  )
}
</script>

{#snippet blockTypeSelect(locale: LocaleKey)}
  {@const block = getAddressPresentationLocale(address, locale)}
  <SelectField
    contentClass={addressSelectContentClass}
    triggerAttrs={{ 'aria-label': m.address_block_type() }}
    triggerClass="h-12 min-h-12 w-auto! gap-2 rounded-md bg-panel! text-foreground! [&_*]:text-foreground! px-2"
    class={String.raw`w-full shrink-0 gap-0! [&_.bits-form\_\_label]:hidden`}
    isEditing={true}
    items={ADDRESS_BLOCK_TYPES.map(code => ({
      value: code,
      label: addressBlockTypeLabel(code, locale),
    }))}
    value={String(block.blockType || 'block')}
    onValueChange={type => chooseLocalizedType('blockExpression', locale, String(type))}
  />
{/snippet}

{#snippet fieldAction(
  field: EditableAddressField,
  locale: LocaleKey,
  structured: boolean,
)}
  {#each Object.keys(referenceNotice).filter(
    key => key.endsWith(`-${field}`) && referenceNotice[key],
  ) as key}
    <SimpleTooltip
      bind:open={referenceNoticeOpen[key]}
      contentProps={{ role: 'status' }}
    >
      {#snippet trigger()}
        <button
          type="button"
          aria-label={referenceNotice[key]}
          class="text-primary flex size-7 items-center justify-center"
        >
          <InfoIcon class="size-4" />
        </button>
      {/snippet}
      {referenceNotice[key]}
    </SimpleTooltip>
  {/each}
  {#if field === 'floorExpression' && floorNotice}
    <SimpleTooltip bind:open={floorNoticeOpen} contentProps={{ role: 'status' }}>
      {#snippet trigger()}
        <button
          type="button"
          aria-label={floorNotice}
          class="text-primary flex size-7 items-center justify-center"
        >
          <InfoIcon class="size-4" />
        </button>
      {/snippet}
      {floorNotice}
    </SimpleTooltip>
  {/if}
  {#if !replacingNames[`${locale}-${field}`] ||
    !addressComponentValue(address, locale, field)}
    {#if !translations &&
      field === 'blockExpression' &&
      activeBlockLocale === locale &&
      (referenceDrafts[`${locale}-${field}`] ??
        String(getAddressPresentationLocale(address, locale).blockRef ?? ''))}
      <button
        use:reverseTabStop
        type="button"
        aria-label={m.filters__clear()}
        data-tooltip={m.filters__clear()}
        class="text-muted-foreground hover:text-primary focus-visible:outline-primary flex size-7 shrink-0 items-center justify-center rounded focus-visible:outline-2"
        onpointerdown={event => event.preventDefault()}
        onclick={() => {
          const block = getAddressPresentationLocale(address, locale)
          referenceDrafts[`${locale}-${field}`] = ''
          clearTimeout(referenceTimers.get(`${locale}-${field}`))
          onChange(
            setAddressBlock(
              address,
              locale,
              String(block.blockType || 'block'),
              '',
              block.blockTypeBeforeNumber === true ||
                (block.blockTypeBeforeNumber == null && locale === 'en'),
            ),
          )
          document.getElementById(`address-${locale}-${field}`)?.focus()
        }}
      >
        ×
      </button>
    {:else if field !== 'formattedAddress'}
      {@const original = resetAddressComponent(address, field)}
      {@const unchanged = locales.every(
        target =>
          addressComponentValue(address, target, field) ===
          addressComponentValue(original, target, field),
      )}
      {@const emptySource = locales.every(
        target => !addressComponentValue(original, target, field),
      )}
      <button
        use:reverseTabStop
        type="button"
        aria-label={field !== 'accessHint' && unchanged && !emptySource
          ? m.filters__clear()
          : m.feature_address_reset()}
        class="text-muted-foreground hover:text-primary focus-visible:outline-primary flex size-7 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-focus-within/subsection:opacity-100 group-hover/subsection:opacity-100 focus-visible:opacity-100 focus-visible:outline-2"
        onclick={() => {
          if (field === 'buildingNumberExpression') {
            numberRequest++
            numberCaveat = null
          }
          addedFields = addedFields.filter(item => item !== field)
          if (field === 'floorExpression') {
            explicitFloorType = undefined
            floorDraft = undefined
            floorNotice = ''
            clearTimeout(floorInputTimer)
            clearTimeout(floorNoticeTimer)
          }
          for (const target of locales) {
            delete typeOverrides[`${target}-${field}`]
            delete referenceDrafts[`${target}-${field}`]
            clearTimeout(referenceTimers.get(`${target}-${field}`))
            if (field === 'phaseExpression') {
              delete phaseTypes[target]
              delete phaseDrafts[target]
              clearTimeout(phaseTimers.get(target))
            }
          }
          onChange(
            unchanged && !emptySource
              ? clearAddressComponent(address, field)
              : original,
          )
        }}
      >
        {#if field !== 'accessHint' && unchanged && !emptySource}
          <XIcon class="size-4" />
        {:else}
          <ResetIcon class="size-4" />
        {/if}
      </button>
    {/if}
  {/if}
{/snippet}

{#snippet addDetails()}
  {#if addableAddressParts.length}
    <fieldset class="min-w-0">
      <legend class="text-muted-foreground mb-4 text-sm">
        {m.address_add_parts()}
      </legend>
      <div class="flex flex-wrap gap-2">
        {#each addableAddressParts as field}
          <Button
            text={labels[field]}
            type="button"
            size="sm"
            style="outline"
            onClick={() => void addField(field)}
          />
        {/each}
      </div>
    </fieldset>
  {/if}
  {#if canAddAccessHint || canAddAccessibility}
    <fieldset class="min-w-0" class:mt-3={addableAddressParts.length > 0}>
      <legend class="text-muted-foreground mb-4 text-sm">
        {m.address_describe_accessibility()}
      </legend>
      <div class="flex flex-wrap gap-2">
        {#if canAddAccessHint}
          <Button
            text={labels.accessHint}
            type="button"
            size="sm"
            style="outline"
            onClick={() => void addField('accessHint')}
          />
        {/if}
        {#if canAddAccessibility}
          <Button
            text={m.accessibility_mobility_heading()}
            type="button"
            size="sm"
            style="outline"
            onClick={addAccessibility}
          />
        {/if}
      </div>
    </fieldset>
  {/if}
{/snippet}

{#if splitColumns && isEditing}
  <div
    class="relative flex min-w-0 flex-col transition-opacity duration-250 motion-reduce:transition-none {independentScroll
      ? 'min-h-0'
      : ''}"
    class:opacity-0={!hasAvailableParts}
    class:pointer-events-none={!hasAvailableParts}
    inert={!hasAvailableParts}
    aria-hidden={!hasAvailableParts}
  >
    <button
      inert={partsOpen}
      aria-hidden={partsOpen}
      type="button"
      aria-label={m.address_parts_show()}
      data-tooltip={m.address_parts_show()}
      aria-expanded="false"
      class="border-border bg-panel text-muted-foreground hover:text-primary absolute top-5 left-0 flex w-8 flex-col items-center gap-3 self-start rounded-md border py-3 transition-[opacity,transform,visibility] duration-200 motion-reduce:transition-none {partsOpen
        ? 'invisible -translate-x-2 opacity-0'
        : 'visible translate-x-0 opacity-100'}"
      onclick={onToggleParts}
    >
      <PanelLeftIcon class="size-4" />
      <span class="text-xs font-medium [writing-mode:vertical-rl]"
        >{m.address_parts_rail()}</span
      ><span class="text-xs tabular-nums"
        >{availableFields.length -
          visibleFields.length +
          Number(canAddAccessibility)}</span
      >
    </button>
    <div
      class="flex min-w-0 flex-col {independentScroll
        ? 'min-h-0'
        : ''} transition-[opacity,transform,visibility] duration-250 ease-out motion-reduce:transition-none {partsOpen
        ? 'visible flex-1 translate-x-0 opacity-100'
        : 'invisible absolute inset-x-0 top-0 -translate-x-3 opacity-0'} {partsOverlay
        ? 'z-30 overflow-visible'
        : 'border-border/60 bg-muted/20 -ml-6 overflow-clip border-r pl-6'} {hasAvailableParts
        ? ''
        : 'hidden'}"
      inert={!hasAvailableParts || !partsOpen}
      aria-hidden={!hasAvailableParts || !partsOpen}
    >
      <!-- Keep the sidebar text stable while its track expands; bounded editors scroll each pane independently. -->
      <section
        class="flex min-w-0 flex-col gap-4 {independentScroll
          ? 'min-h-0 overflow-y-auto overscroll-contain'
          : ''} {partsOverlay
          ? 'absolute left-0 top-3 z-30 w-80 rounded-lg border border-border bg-panel p-4 shadow-lg'
          : 'w-80 flex-1 pr-4 pl-2 pt-2'} transition-[transform,opacity] duration-250 motion-reduce:transition-none {hasAvailableParts
          ? 'translate-x-0 opacity-100'
          : '-translate-x-full opacity-0'}"
        aria-label={m.feature_address_title()}
        data-address-additions
      >
        <div class="shrink-0 space-y-1">
          <div class="flex min-h-10 items-center justify-between gap-2">
            <h2 class="text-lg font-semibold">{m.feature_address_title()}</h2>
            {#if onToggleParts}
              <button
                type="button"
                aria-label={m.address_parts_hide()}
                data-tooltip={m.address_parts_hide()}
                aria-expanded="true"
                class="text-muted-foreground hover:text-primary flex size-7 items-center justify-center rounded"
                onclick={onToggleParts}
              >
                <PanelLeftIcon class="size-4" />
              </button>
            {/if}
          </div>
          {@render addDetails()}
        </div>
        {#if address.association}
          <!-- Keep metadata in flow: short panels scroll it below the controls instead of covering them. -->
          <div class="mt-auto shrink-0 py-5">
            <LocationAssociationStatus value={address.association} />
          </div>
        {/if}
      </section>
    </div>
  </div>
{/if}

<section
  use:measureEditorMinimum={`${visibleFields.join(',')}:${getStructuredAddressType(address, 'floorExpression')}:${getStructuredAddressType(address, 'unitExpression')}:${getLocaleKey()}`}
  class="min-w-0 space-y-4 [overflow-anchor:none] {independentScroll
    ? 'min-h-0 overflow-y-auto overscroll-contain'
    : ''} {splitColumns && isEditing ? 'pt-2 pb-5' : ''}"
  aria-label={splitColumns ? m.feature_location_title() : m.feature_address_title()}
  data-address-details
>
  <div
    class="flex flex-wrap items-center justify-between gap-2 {splitColumns && isEditing
      ? 'mb-2!'
      : ''}"
  >
    <h2 class="text-lg font-semibold">
      {splitColumns ? m.feature_location_title() : m.feature_address_title()}
    </h2>
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      {#if onLookup && isEditing}
        <button
          type="button"
          disabled={isLookupLoading}
          aria-busy={isLookupLoading}
          class="text-primary hover:bg-primary/10 flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm disabled:opacity-50"
          onclick={onLookup}
        >
          {#if isLookupLoading}
            <LoaderIcon
              aria-hidden="true"
              class="size-4 animate-spin motion-reduce:animate-none"
            />
          {:else}
            <SearchIcon aria-hidden="true" class="size-4" />
          {/if}
          {m.feature_address_lookup()}
        </button>
      {/if}
      {@render identityControls?.()}
      <LocaleToolbar
        {selectedLocales}
        visibleLocales={addressLocaleState.visibleLocales}
        expanded={translations}
        options={contentLocaleOptions(getLocaleKey())}
        allowAdd={isEditing}
        {contentLocales}
        onExpandedChange={expanded =>
          changeLocaleState({ ...addressLocaleState, expanded })}
        onChange={change => changeLocaleState({ ...change, expanded: translations })}
      />
      {@render identityInfo?.()}
    </div>
  </div>
  {#if isEditing && buildingLoading}
    <p role="status" class="text-muted-foreground text-sm">{m.resource_loading()}</p>
  {/if}
  {#if isEditing && buildingFailed}
    <p role="alert" class="text-muted-foreground text-sm">
      {m.building_details_failed()}
    </p>
  {/if}
  {#if isEditing && buildingSelection && buildingSelection.details.addresses.length > 1}
    <fieldset class="border-border space-y-2 rounded-lg border p-3">
      <legend class="px-1 text-sm font-medium">{m.building_choose_address()}</legend>
      <p class="text-muted-foreground text-xs">
        {m.building_address_candidates_help()}
      </p>
      {#each buildingSelection.details
        .addresses as candidate (`${candidate.id}:${candidate.snapshotId}`)}
        <button
          type="button"
          class="hover:bg-muted focus-visible:outline-primary block w-full rounded-md p-2 text-left text-sm focus-visible:outline-2"
          onclick={() => chooseBuildingAddress(candidate)}
        >
          {candidate.display[ADDRESS_LOCALES[getLocaleKey()]] ||
            candidate.display.en ||
            Object.values(candidate.display)[0]}
        </button>
      {/each}
    </fieldset>
  {/if}
  {#if !isEditing}
    {#each shownLocales as tag (tag)}
      {@const locale = addressLocaleKey(tag)}
      <div
        animate:flip={{ duration: prefersReducedMotion.current ? 0 : 200 }}
        transition:localeSlide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
        class="space-y-3"
        lang={tag}
      >
        {#if translations}
          <p class="text-muted-foreground text-xs">{shortLocaleLabel(tag)}</p>
        {/if}
        <p
          class="min-w-0 text-xl leading-relaxed font-medium break-words whitespace-normal"
          data-address-display
        >
          {(locale
            ? getAddressDisplay(address, locale)
            : additionalLocaleValue(tag, 'formattedAddress')) || '—'}
        </p>
        {#if locale}
          <AddressBlocks {address} {locale} includeDivisions={false} />
          {#if showAccessHints && addressComponentValue(address, locale, 'accessHint')}
            <p class="text-muted-foreground text-sm">
              {addressComponentValue(address, locale, 'accessHint')}
            </p>
          {/if}
        {:else if accessHintValue(tag)}
          <p class="text-muted-foreground text-sm">{accessHintValue(tag)}</p>
        {/if}
      </div>
    {/each}
  {:else}
    <div class="grid grid-cols-6 items-start gap-x-4 [&>*]:mb-6 [&>*:last-child]:mb-0">
      {@render identityFields?.(translations)}
      {#if hideDisplayAddress && translations}
        <fieldset
          transition:localeSlide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
          class="border-border/40 @container col-span-6 min-w-0 border-b pb-6"
        >
          <legend class="sr-only">
            {m.feature_address_formattedAddress()}
          </legend>
          <div
            class="grid min-w-0 grid-cols-1 items-start gap-x-6 gap-y-1 @min-[40rem]:grid-cols-2"
          >
            {#each shownLocales.filter(
              tag => addressLocaleKey(tag) !== getLocaleKey(),
            ) as tag (tag)}
              {@const locale = addressLocaleKey(tag)}
              <div
                animate:flip={{ duration: prefersReducedMotion.current ? 0 : 200 }}
                class="flex min-w-0 items-center gap-2"
              >
                <span class="text-muted-foreground w-[3em] shrink-0 font-mono text-xs"
                  >{shortLocaleLabel(tag)}</span
                >
                {#if locale}
                  <AddressDisplayField
                    {locationKind}
                    {divisions}
                    {address}
                    {locale}
                    {isEditing}
                    showLocale={translations}
                    localeLabelOutside
                    compact={true}
                    scrollWhenConstrained={true}
                    {onChange}
                  />
                {:else}
                  <input
                    aria-label={labels.formattedAddress}
                    class="border-border bg-panel h-12 min-w-0 rounded-lg border px-3"
                    value={additionalLocaleValue(tag, 'formattedAddress')}
                    oninput={event =>
                      editAdditionalLocale(
                        tag,
                        'formattedAddress',
                        event.currentTarget.value,
                      )}
                  >
                {/if}
              </div>
            {/each}
          </div>
        </fieldset>
      {/if}
      {#each visibleGroups as { fields: group, title }, groupIndex (group[0])}
        <div
          data-address-group={group[0]}
          class="col-span-6 min-w-0 {groupIndex
            ? 'border-t border-border/40 pt-6'
            : ''}"
        >
          {#if title}
            <h3 class="text-muted-foreground mb-2 text-xs font-medium">{title()}</h3>
          {/if}
          {#if group[0] === 'accessHint'}
            <div class="group/subsection mb-3 flex items-center gap-2">
              <h4 class="text-sm font-semibold">
                {m.accessibility_entrance_heading()}
              </h4>
              {@render fieldAction('accessHint', getLocaleKey(), false)}
            </div>
          {/if}
          <div
            class={group.length > 1
              ? 'max-w-full min-w-0 overflow-x-auto [contain:inline-size_paint]'
              : ''}
          >
            <div
              class={group.length > 1 ? 'grid w-max min-w-full gap-x-4' : ''}
              style:grid-template-columns={group.length > 1
                ? `${translations ? 'max-content ' : ''}repeat(${group.reduce((count, field) => count + fieldColumns(field), 0)}, max-content)`
                : undefined}
            >
              {#each group[0] === 'accessHint'
                ? [shownLocales[0]]
                : shownLocales as rowTag, rowIndex (rowTag)}
                {@const rowLocale = addressLocaleKey(rowTag)}
                <div
                  animate:flip={{ duration: prefersReducedMotion.current ? 0 : 200 }}
                  class="min-w-0 items-start pt-2 first:pt-0 {group.length > 1
                    ? 'col-span-full grid grid-cols-subgrid'
                    : 'flex gap-2'}"
                >
                  {#if translations && group[0] !== 'accessHint'}
                    <span
                      class="text-muted-foreground flex h-12 w-[3em] shrink-0 items-center font-mono text-xs"
                      class:mt-8={rowIndex === 0}
                      >{shortLocaleLabel(rowTag)}</span
                    >
                  {/if}
                  <div
                    class="min-w-0 items-start {group.length > 1
                      ? 'grid grid-cols-subgrid'
                      : 'flex flex-wrap gap-4'}"
                    style:grid-column={group.length > 1
                      ? `${translations ? 2 : 1} / -1`
                      : undefined}
                    data-address-field-row
                  >
                    {#if !rowLocale && group[0] !== 'accessHint'}
                      {#if rowIndex === 0}
                        {#each group.filter(field =>
                          [
                            'floorExpression',
                            'unitExpression',
                            'buildingNumberExpression',
                          ].includes(field),
                        ) as field (field)}
                          <label class="flex min-w-0 flex-col gap-2"
                            ><span class="text-sm font-medium">{labels[field]}</span>
                            <input
                              class="border-border bg-panel h-12 w-28 rounded-lg border px-3"
                              value={addressComponentValue(
                                address,
                                getLocaleKey(),
                                field,
                              )}
                              oninput={event =>
                                onChange(
                                  setAddressExpression(
                                    address,
                                    getLocaleKey(),
                                    field,
                                    event.currentTarget.value,
                                  ),
                                )}
                            ></label
                          >
                        {/each}
                      {/if}
                      {#each group.filter(
                        field =>
                          ![
                            'floorExpression',
                            'unitExpression',
                            'buildingNumberExpression',
                          ].includes(field),
                      ) as field (field)}
                        <label
                          style:grid-column={group.length > 1
                            ? `${1 + group.slice(0, group.indexOf(field)).reduce((count, item) => count + fieldColumns(item), 0)} / span ${fieldColumns(field)}`
                            : undefined}
                          class="flex min-w-0 flex-col gap-2"
                        >
                          <span class:sr-only={rowIndex > 0} class="text-sm font-medium"
                            >{labels[field]}</span
                          >
                          <input
                            class="border-border bg-panel h-12 min-w-0 rounded-lg border px-3 text-base font-medium"
                            aria-label={labels[field]}
                            value={additionalLocaleValue(rowTag, field)}
                            oninput={event =>
                              editAdditionalLocale(
                                rowTag,
                                field,
                                event.currentTarget.value,
                              )}
                          >
                        </label>
                      {/each}
                    {:else}
                      {#each group as field (field)}
                        {@const structured =
                          field === 'floorExpression' || field === 'unitExpression'}
                        {@const shared =
                          structured || field === 'buildingNumberExpression'}
                        {#if field === 'accessHint'}
                          <fieldset class="w-full min-w-0">
                            <legend
                              class="mb-1 flex min-h-7 flex-wrap items-center gap-2 text-sm font-medium"
                            >
                              <UnitIcon
                                class="text-muted-foreground size-4 shrink-0"
                                aria-hidden="true"
                              />
                              {labels.accessHint}
                              <FormI18nSourceBar
                                compact
                                visible={isEditing && accessHintSources.length > 0}
                                label={m.address_translate_from()}
                                sources={accessHintSources.map(locale => ({
                                  locale,
                                  label: addressLocaleKey(locale)
                                    ? addressLocaleLabel(addressLocaleKey(locale)!)
                                    : shortLocaleLabel(locale),
                                  accessibleLabel: `${labels.accessHint}: ${m.address_translate_from()} ${addressLocaleKey(locale) ? addressLocaleLabel(addressLocaleKey(locale)!) : shortLocaleLabel(locale)}`,
                                }))}
                                hasTargets={accessHintSources.length <
                                  selectedLocales.length}
                                busy={accessHintTranslationSource !== null}
                                busySource={accessHintTranslationSource ?? undefined}
                                onTranslate={source =>
                                  void translateAccessHints(source)}
                              />
                            </legend>
                            {#if accessHintTranslationFailed}
                              <p role="alert" class="text-destructive text-xs">
                                {m.address_translate_error()}
                              </p>
                            {/if}
                            {#each shownLocales as locale (locale)}
                              <div
                                animate:flip={{
                                  duration: prefersReducedMotion.current ? 0 : 200,
                                }}
                                class="pt-2 first-of-type:pt-0"
                                transition:localeSlide={{
                                  duration: prefersReducedMotion.current ? 0 : 200,
                                }}
                              >
                                <FormI18nInlineRow
                                  value={accessHintValue(locale)}
                                  label={translations
                                    ? `${labels.accessHint} · ${addressLocaleKey(locale) ? addressLocaleLabel(addressLocaleKey(locale)!) : shortLocaleLabel(locale)}`
                                    : labels.accessHint}
                                  prefix={translations ? shortLocaleLabel(locale) : ''}
                                  editable={isEditing}
                                  showVerification={false}
                                  required={false}
                                  issues={undefined}
                                  attrs={{
                                    id: `${uid}-${locale}-access-hint`,
                                    placeholder: examples.accessHint(
                                      {},
                                      {
                                        locale:
                                          ADDRESS_LOCALES[
                                            addressLocaleKey(locale) ?? getLocaleKey()
                                          ],
                                      },
                                    ),
                                    oninput: (event: Event) =>
                                      editAdditionalLocale(
                                        locale,
                                        'accessHint',
                                        (event.currentTarget as HTMLInputElement).value,
                                      ),
                                  }}
                                  onStart={() => {
                                    accessHintBeforeEdit[locale] =
                                      accessHintValue(locale)
                                  }}
                                  onCancel={() =>
                                    editAdditionalLocale(
                                      locale,
                                      'accessHint',
                                      accessHintBeforeEdit[locale] ?? '',
                                    )}
                                  onClear={() =>
                                    editAdditionalLocale(locale, 'accessHint', '')}
                                />
                              </div>
                            {/each}
                          </fieldset>
                        {:else}
                          <fieldset
                            style:grid-column={group.length > 1
                              ? `${1 + group.slice(0, group.indexOf(field)).reduce((count, item) => count + fieldColumns(item), 0)} / span ${fieldColumns(field)}`
                              : undefined}
                            class:hidden={shared && rowIndex > 0}
                            class="group/subsection min-w-0 max-w-full flex-initial space-y-0 {group.length >
                            1
                              ? 'grid grid-cols-subgrid'
                              : 'w-max'} {structured ||
                            field === 'blockExpression' ||
                            field === 'buildingNumberExpression'
                              ? 'shrink-0!'
                              : ''}"
                          >
                            {#if rowIndex === 0}
                              <legend
                                class="mb-0 flex h-8 items-center gap-2 px-3 font-medium {field ===
                                'formattedAddress'
                                  ? 'text-xs text-muted-foreground'
                                  : 'text-sm'}"
                              >
                                <span
                                  class="flex min-h-7 items-center gap-2 whitespace-nowrap"
                                  class:invisible={field === 'buildingName' &&
                                    Boolean(
                                      addressComponentValue(
                                        address,
                                        rowLocale ?? getLocaleKey(),
                                        field,
                                      ),
                                    )}
                                  >{field === 'buildingNumberExpression'
                                    ? m.address_field_number()
                                    : field === 'streetName' ||
                                        field === 'buildingName' ||
                                        field === 'premisesName'
                                      ? m.field_name()
                                      : labels[field]}{@render fieldAction(
                                    field,
                                    getLocaleKey(),
                                    structured,
                                  )}</span
                                >
                                {#if field === 'unitPortion' && translations}
                                  {@const sources = activeLocales.filter(locale =>
                                    addressComponentValue(
                                      address,
                                      locale,
                                      field,
                                    ).trim(),
                                  )}
                                  {@const target = activeLocales.find(
                                    locale =>
                                      !addressComponentValue(
                                        address,
                                        locale,
                                        field,
                                      ).trim(),
                                  )}
                                  {#if sources.length && target}
                                    <span
                                      class="inline-flex align-middle [&>div]:min-h-7"
                                    >
                                      <FormI18nTranslationBar
                                        compact
                                        targetLocale={ADDRESS_LOCALES[target]}
                                        availableLocales={sources.map(
                                          locale => ADDRESS_LOCALES[locale],
                                        )}
                                        isEditing={true}
                                        isVisible={true}
                                        onTranslate={source => translatePart(source)}
                                      />
                                    </span>
                                  {/if}
                                {/if}
                              </legend>
                            {/if}
                            <!-- The fieldset legend owns the label; inline controls must not reserve a second label row. -->
                            <div
                              use:animateAddressColumns={field === 'blockExpression' ||
                                field === 'phaseExpression'}
                              class="grid min-w-0 {group.length > 1
                                ? 'col-span-full grid-cols-subgrid'
                                : field === 'blockExpression'
                                  ? 'grid-cols-[max-content_max-content_max-content]'
                                  : field === 'phaseExpression'
                                    ? 'grid-cols-[max-content_max-content]'
                                    : ''}"
                            >
                              {#each shared
                                ? rowIndex === 0
                                  ? [getLocaleKey()]
                                  : []
                                : [rowLocale ?? getLocaleKey()] as locale (locale)}
                                {@const value =
                                  field === 'formattedAddress'
                                    ? getAddressDisplay(address, locale)
                                    : addressComponentValue(address, locale, field)}
                                {@const namedPhase =
                                  field === 'phaseExpression' &&
                                  (phaseTypes[locale] ??
                                    phaseEditorValue(address, locale).type) === 'named'}
                                {@const inputMinimum =
                                  field === 'unitPortion'
                                    ? '11rem'
                                    : field === 'premisesName'
                                      ? '13rem'
                                      : namedPhase
                                        ? '12rem'
                                        : field === 'buildingNumberExpression'
                                          ? '5rem'
                                          : '4rem'}
                                {@const suggestions = getExpressionSuggestions(
                                  field,
                                  locale,
                                )}
                                <div
                                  data-address-locale={locale}
                                  transition:localeSlide={{
                                    duration: prefersReducedMotion.current ? 0 : 200,
                                  }}
                                  use:adaptivePlaceholder={field === 'phaseExpression'
                                    ? (namedPhase
                                        ? m.address_phase_named_example
                                        : m.address_phase_reference_example)(
                                        {},
                                        { locale: ADDRESS_LOCALES[locale] },
                                      )
                                    : field === 'unitExpression'
                                      ? m.address_unit_reference_placeholder(
                                          {},
                                          { locale: ADDRESS_LOCALES[locale] },
                                        )
                                      : examples[field](
                                          {},
                                          { locale: ADDRESS_LOCALES[locale] },
                                        )}
                                  class="min-h-12 min-w-0 items-center gap-2 pt-2 first:pt-0 {field ===
                                    'blockExpression' || field === 'phaseExpression'
                                    ? 'col-span-full grid grid-cols-subgrid'
                                    : 'flex flex-wrap'}"
                                >
                                  {#if field === 'formattedAddress'}
                                    <AddressDisplayField
                                      {locationKind}
                                      {divisions}
                                      {address}
                                      {locale}
                                      {isEditing}
                                      showLocale={translations}
                                      localeLabelOutside
                                      {onChange}
                                    />
                                  {:else if field === 'streetName' ||
                                    field === 'buildingName'}
                                    {@const sourceLocales = locales.filter(
                                      source =>
                                        source !== locale &&
                                        addressComponentValue(
                                          address,
                                          source,
                                          field,
                                        ).trim(),
                                    )}
                                    {#if field === 'buildingName' &&
                                      translations &&
                                      !value &&
                                      sourceLocales.length}
                                      <div class="flex min-h-12 items-center gap-2">
                                        <FormI18nTranslationBar
                                          compact
                                          targetLocale={ADDRESS_LOCALES[locale]}
                                          availableLocales={sourceLocales.map(
                                            source => ADDRESS_LOCALES[source],
                                          )}
                                          isEditing={true}
                                          isVisible={true}
                                          onTranslate={async (source, target) => {
                                            const originalAddress = address
                                            const generation = translationGeneration
                                            const sourceValue = addressComponentValue(
                                              address,
                                              toLocaleKey(source),
                                              field,
                                            )
                                            const [translated] = await translateText(
                                              source,
                                              target,
                                              [sourceValue],
                                            )
                                            // Do not replace edits made while the translation was in flight.
                                            if (
                                              translationActive &&
                                              isEditing &&
                                              generation === translationGeneration &&
                                              address === originalAddress &&
                                              translated &&
                                              !addressComponentValue(
                                                address,
                                                locale,
                                                field,
                                              ) &&
                                              addressComponentValue(
                                                address,
                                                toLocaleKey(source),
                                                field,
                                              ) === sourceValue
                                            )
                                              onChange(
                                                setAddressExpression(
                                                  address,
                                                  locale,
                                                  field,
                                                  translated,
                                                ),
                                              )
                                          }}
                                        />
                                      </div>
                                    {:else}
                                      <div
                                        class="w-max min-w-0 max-w-full {value &&
                                        !replacingNames[`${locale}-${field}`]
                                          ? ''
                                          : 'min-w-56'}"
                                      >
                                        <AddressNamePicker
                                          onBlur={field === 'buildingName'
                                            ? onBuildingNameBlur
                                            : undefined}
                                          {locale}
                                          detached={address.detachedNames?.[field]?.[
                                            ADDRESS_LOCALES[locale]
                                          ] === value}
                                          showLocale={false}
                                          family={field === 'streetName'
                                            ? 'streets'
                                            : 'buildings'}
                                          {value}
                                          label={labels[field]}
                                          onClear={() => {
                                            if (field === 'buildingName') {
                                              buildingRequest++
                                              buildingLoading = false
                                              buildingFailed = false
                                              buildingSelection = null
                                              selectedBuilding = null
                                            }
                                            translationGeneration++
                                            onChange(
                                              setAddressOverride(
                                                address,
                                                locale,
                                                field,
                                                null,
                                              ),
                                            )
                                          }}
                                          onReplacingChange={replacing =>
                                            (replacingNames[`${locale}-${field}`] =
                                              replacing)}
                                          onSelect={record =>
                                            field === 'buildingName'
                                              ? void selectBuilding(record, locale)
                                              : onChange(
                                                  setAddressName(
                                                    address,
                                                    field,
                                                    record,
                                                  ),
                                                )}
                                        />
                                      </div>
                                    {/if}
                                  {:else}
                                    {#if field === 'blockExpression' &&
                                      blockTypeFirst(locale)}
                                      {@render blockTypeSelect(locale)}
                                    {/if}
                                    {#if field === 'phaseExpression'}
                                      <SelectField
                                        contentClass={addressSelectContentClass}
                                        triggerAttrs={{
                                          'aria-label':
                                            m.feature_address_phaseExpression(),
                                        }}
                                        triggerClass="h-12 min-h-12 w-auto! gap-2 rounded-md bg-panel! text-foreground! [&_*]:text-foreground! px-2"
                                        class={String.raw`w-full shrink-0 gap-0! [&_.bits-form\_\_label]:hidden`}
                                        isEditing={true}
                                        items={[
                                          {
                                            value: 'phase',
                                            label: m.address_phase_type_phase(
                                              {},
                                              { locale: ADDRESS_LOCALES[locale] },
                                            ),
                                          },
                                          {
                                            value: 'stage',
                                            label: m.address_phase_type_stage(
                                              {},
                                              { locale: ADDRESS_LOCALES[locale] },
                                            ),
                                          },
                                          {
                                            value: 'named',
                                            label: `{${m.address_phase_type_named({}, { locale: ADDRESS_LOCALES[locale] })}}`,
                                          },
                                        ]}
                                        value={phaseTypes[locale] ??
                                          phaseEditorValue(address, locale).type}
                                        onValueChange={type =>
                                          chooseLocalizedType(
                                            'phaseExpression',
                                            locale,
                                            String(type),
                                          )}
                                      />
                                    {/if}
                                    {#if field === 'floorExpression'}
                                      <SelectField
                                        contentClass={addressSelectContentClass}
                                        id="address-floorExpression-type"
                                        triggerAttrs={{
                                          id: 'address-floorExpression-type',
                                          'aria-label': m.feature_address_floor_type(),
                                        }}
                                        triggerClass="h-12 min-h-12 w-auto! gap-2 rounded-md bg-panel! text-foreground! [&_*]:text-foreground! px-2"
                                        class={String.raw`w-max shrink-0 gap-0! [&_.bits-form\_\_label]:hidden`}
                                        isEditing={true}
                                        items={FLOOR_TYPES.map(code => ({
                                          value: code,
                                          label: addressTerm(floorTerms[code], locale),
                                        }))}
                                        value={getStructuredAddressType(address, field)}
                                        onValueChange={code => {
                                          clearTimeout(floorInputTimer)
                                          explicitFloorType =
                                            FloorTypeSchema.parse(code)
                                          const reference =
                                            floorDraft ??
                                            addressFloorReference(address, locale)
                                          floorDraft = reference
                                          onChange(
                                            setAddressFloorReference(
                                              address,
                                              reference,
                                              explicitFloorType,
                                            ),
                                          )
                                        }}
                                      />
                                    {:else if field === 'unitExpression'}
                                      <SelectField
                                        contentClass={addressSelectContentClass}
                                        id="address-unitExpression-type"
                                        triggerAttrs={{
                                          id: 'address-unitExpression-type',
                                          'aria-label': m.feature_address_unit_type(),
                                        }}
                                        triggerClass="h-12 min-h-12 w-auto! gap-2 rounded-md bg-panel! text-foreground! [&_*]:text-foreground! px-2"
                                        placeholder={m.feature_address_unit_type()}
                                        class={String.raw`w-max shrink-0 gap-0! [&_.bits-form\_\_label]:hidden`}
                                        isEditing={true}
                                        items={UNIT_TYPES.map(code => ({
                                          value: code,
                                          label: addressTerm(unitTerms[code], locale),
                                        }))}
                                        value={getStructuredAddressType(address, field)}
                                        onValueChange={code => {
                                          const unitType = UnitTypeSchema.parse(code)
                                          onChange(
                                            setStructuredAddressExpression(
                                              address,
                                              locale,
                                              field,
                                              addressUnitReference(address, locale),
                                              unitType,
                                            ),
                                          )
                                        }}
                                      />
                                    {/if}
                                    {#if field === 'unitExpression' &&
                                      getStructuredAddressType(address, field) === 'X'}
                                      <TextInput
                                        name=""
                                        class="order-last col-span-full w-full"
                                        inputClass="h-10 px-3! text-base! font-medium! bg-transparent text-foreground! placeholder:text-muted-foreground/65!"
                                        controlClass="bg-panel! text-foreground"
                                        isEditing={true}
                                        value={customAddressType(
                                          address,
                                          locale,
                                          field,
                                        )}
                                        placeholder={m.address_custom_type_placeholder(
                                          {},
                                          { locale: ADDRESS_LOCALES[locale] },
                                        )}
                                        inputAttrs={{
                                          'aria-label': m.address_custom_unit_type(),
                                        }}
                                        onValueChange={term =>
                                          onChange(
                                            setCustomAddressUnit(
                                              address,
                                              locale,
                                              addressUnitReference(address, locale),
                                              term ?? '',
                                            ),
                                          )}
                                      />
                                    {:else if field === 'blockExpression' &&
                                      getAddressLocale(address, locale).blockType ===
                                        'other'}
                                      <TextInput
                                        name=""
                                        class="order-last col-span-full w-full"
                                        inputClass="h-10 px-3! text-base! font-medium! bg-transparent text-foreground! placeholder:text-muted-foreground/65!"
                                        controlClass="bg-panel! text-foreground"
                                        isEditing={true}
                                        value={customAddressType(
                                          address,
                                          locale,
                                          field,
                                        )}
                                        placeholder={m.address_custom_type_placeholder(
                                          {},
                                          { locale: ADDRESS_LOCALES[locale] },
                                        )}
                                        inputAttrs={{
                                          'aria-label': m.address_custom_block_type(),
                                        }}
                                        onValueChange={term => {
                                          const block = getAddressPresentationLocale(
                                            address,
                                            locale,
                                          )
                                          onChange(
                                            setAddressBlock(
                                              address,
                                              locale,
                                              'other',
                                              String(block.blockRef ?? ''),
                                              block.blockTypeBeforeNumber === true,
                                              term ?? '',
                                            ),
                                          )
                                        }}
                                      />
                                    {/if}
                                    <TextInput
                                      name=""
                                      id={`address-${locale}-${field}`}
                                      fitValue={true}
                                      fitMinWidth={inputMinimum}
                                      inputClass="h-10 px-3! text-base! font-medium! bg-transparent text-foreground! placeholder:text-muted-foreground/65!"
                                      controlClass="h-12 gap-2 bg-panel! text-foreground [&_span]:text-muted-foreground {field ===
                                        'buildingNumberExpression' && numberError
                                        ? 'border-destructive!'
                                        : ''}"
                                      class={String.raw`gap-0! w-max min-w-0 max-w-full flex-initial [&_.bits-form\_\_label]:hidden`}
                                      value={field === 'blockExpression'
                                        ? (referenceDrafts[`${locale}-${field}`] ??
                                          String(
                                            getAddressPresentationLocale(
                                              address,
                                              locale,
                                            ).blockRef || '',
                                          ))
                                        : field === 'unitExpression'
                                          ? (referenceDrafts[`${locale}-${field}`] ??
                                            addressUnitReference(address, locale))
                                          : field === 'floorExpression'
                                            ? (floorDraft ??
                                              addressFloorReference(address, locale))
                                            : field === 'phaseExpression'
                                              ? (phaseDrafts[locale] ??
                                                phaseEditorValue(address, locale).value)
                                              : value}
                                      isEditing={true}
                                      placeholder={field === 'phaseExpression'
                                        ? (namedPhase
                                            ? m.address_phase_named_example
                                            : m.address_phase_reference_example)(
                                            {},
                                            { locale: ADDRESS_LOCALES[locale] },
                                          )
                                        : field === 'unitExpression'
                                          ? m.address_unit_reference_placeholder(
                                              {},
                                              { locale: ADDRESS_LOCALES[locale] },
                                            )
                                          : examples[field](
                                              {},
                                              { locale: ADDRESS_LOCALES[locale] },
                                            )}
                                      inputAttrs={{
                                        'aria-label':
                                          translations && !shared
                                            ? `${labels[field]} · ${ADDRESS_LOCALES[locale]}`
                                            : labels[field],
                                        onfocus:
                                          field === 'blockExpression'
                                            ? () => (activeBlockLocale = locale)
                                            : undefined,
                                        oninput:
                                          field === 'buildingNumberExpression'
                                            ? (event: Event) => {
                                                numberInput =
                                                  event.currentTarget as HTMLInputElement
                                              }
                                            : undefined,
                                        'aria-invalid':
                                          field === 'buildingNumberExpression' &&
                                          numberError
                                            ? true
                                            : undefined,
                                        'aria-describedby':
                                          field === 'buildingNumberExpression' &&
                                          numberError
                                            ? `${uid}-number-error`
                                            : undefined,
                                        onblur:
                                          field === 'buildingNumberExpression'
                                            ? (event: FocusEvent) =>
                                                normalizeNumber(
                                                  event.currentTarget as HTMLInputElement,
                                                  locale,
                                                )
                                            : field === 'blockExpression' ||
                                                field === 'unitExpression'
                                              ? () => {
                                                  activeBlockLocale = null
                                                  normalizeReference(field, locale)
                                                }
                                              : field === 'floorExpression'
                                                ? () => normalizeFloorInput(locale)
                                                : undefined,
                                        list:
                                          ![
                                            'floorExpression',
                                            'unitExpression',
                                            'blockExpression',
                                            'phaseExpression',
                                          ].includes(field) && suggestions.length
                                            ? `${uid}-${locale}-${field}`
                                            : undefined,
                                      }}
                                      onValueChange={next => {
                                        if (field === 'buildingNumberExpression') {
                                          numberRequest++
                                          numberCaveat = null
                                        }
                                        if (field === 'phaseExpression') {
                                          editPhase(next ?? '', locale)
                                          return
                                        }
                                        if (field === 'floorExpression') {
                                          floorDraft = next ?? ''
                                          clearTimeout(floorInputTimer)
                                          onChange(
                                            setStructuredAddressExpression(
                                              address,
                                              locale,
                                              field,
                                              floorDraft,
                                              FloorTypeSchema.parse(
                                                getStructuredAddressType(
                                                  address,
                                                  field,
                                                ),
                                              ),
                                            ),
                                          )
                                          floorInputTimer = setTimeout(
                                            () => normalizeFloorInput(locale),
                                            650,
                                          )
                                          return
                                        }
                                        if (
                                          field === 'unitExpression' ||
                                          field === 'blockExpression'
                                        ) {
                                          const key = `${locale}-${field}`
                                          referenceDrafts[key] = next ?? ''
                                          clearTimeout(referenceTimers.get(key))
                                          referenceTimers.set(
                                            key,
                                            setTimeout(
                                              () => normalizeReference(field, locale),
                                              650,
                                            ),
                                          )
                                          return
                                        }
                                        onChange(
                                          structured
                                            ? setStructuredAddressExpression(
                                                address,
                                                locale,
                                                field as
                                                  | 'floorExpression'
                                                  | 'unitExpression'
                                                  | 'unitPortion',
                                                next,
                                                field === 'floorExpression'
                                                  ? explicitFloorType
                                                  : undefined,
                                              )
                                            : setAddressExpression(
                                                address,
                                                locale,
                                                field,
                                                next,
                                              ),
                                        )
                                      }}
                                    />
                                    {#if field === 'buildingNumberExpression' &&
                                      numberError}
                                      <div class="basis-full">
                                        <p
                                          id={`${uid}-number-error`}
                                          role="alert"
                                          class="text-destructive max-w-72 text-xs"
                                        >
                                          {numberError}
                                        </p>
                                      </div>
                                    {/if}
                                    {#if field === 'buildingNumberExpression' &&
                                      numberCaveat?.key === suggestionKey &&
                                      numberCaveat?.value === value}
                                      <aside
                                        role="status"
                                        class="border-border text-muted-foreground flex max-w-64 items-start gap-2 rounded-md border px-3 py-2 text-xs"
                                      >
                                        <InfoIcon class="mt-0.5 size-4 shrink-0" />
                                        <span>{m.address_map_number_caveat()}</span>
                                        <button
                                          type="button"
                                          aria-label={m.address_map_number_dismiss()}
                                          class="hover:text-foreground focus-visible:outline-primary shrink-0 rounded p-1 focus-visible:outline-2"
                                          onclick={() => (numberCaveat = null)}
                                        >
                                          <XIcon class="size-3" />
                                        </button>
                                      </aside>
                                    {/if}
                                    {#if field === 'blockExpression'}
                                      {@const block = getAddressPresentationLocale(
                                        address,
                                        locale,
                                      )}
                                      {#if !blockTypeFirst(locale)}
                                        {@render blockTypeSelect(locale)}
                                      {/if}
                                      <SimpleTooltip>
                                        {#snippet trigger()}
                                          <button
                                            type="button"
                                            aria-label={m.address_block_type_first()}
                                            aria-pressed={blockTypeFirst(locale)}
                                            class="text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-primary flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-2"
                                            onclick={() =>
                                              onChange(
                                                setAddressBlock(
                                                  address,
                                                  locale,
                                                  String(block.blockType || 'block'),
                                                  String(block.blockRef || ''),
                                                  !blockTypeFirst(locale),
                                                ),
                                              )}
                                          >
                                            <SwapIcon
                                              class="size-4"
                                              aria-hidden="true"
                                            />
                                          </button>
                                        {/snippet}
                                        {m.address_block_type_first_help(
                                          {},
                                          { locale: ADDRESS_LOCALES[locale] },
                                        )}
                                      </SimpleTooltip>
                                    {/if}
                                  {/if}
                                  {#if suggestions.length}
                                    <datalist id={`${uid}-${locale}-${field}`}>
                                      {#each suggestions as suggestion}
                                        <option value={suggestion}></option>
                                      {/each}
                                    </datalist>
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          </fieldset>
                        {/if}
                      {/each}
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
          {#if group.includes('buildingName') && selectedBuilding?.mismatch}
            <div
              role="status"
              aria-live="polite"
              class="border-warning/40 bg-warning/5 text-foreground mt-3 flex max-w-2xl items-start gap-3 rounded-lg border px-3 py-3 text-sm"
            >
              <WarningIcon
                class="text-warning mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <div class="min-w-0 space-y-2">
                <p class="font-medium">
                  {m.address_building_location_mismatch({
                    selected: selectedBuilding.selectedName,
                    current: selectedBuilding.currentName || m.feature_location_title(),
                  })}
                </p>
                <p class="text-muted-foreground">
                  {m.address_building_mismatch_help()}
                </p>
                {#if selectedBuilding.needsAddress}
                  <p class="text-muted-foreground">
                    {m.address_building_choose_address_before_location()}
                  </p>
                {:else if onMakeBuildingActive}
                  <Button
                    text={m.address_building_make_location()}
                    type="button"
                    size="sm"
                    style="outline"
                    onClick={makeSelectedBuildingActive}
                  />
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {#if !splitColumns}
      {@render addDetails()}
    {/if}
  {/if}
  {#if !isEditing && canAddAccessibility}
    <Button
      text={m.accessibility_mobility_heading()}
      type="button"
      size="sm"
      style="outline"
      onClick={addAccessibility}
    />
  {/if}
  {#if accessibilityVisible && onAccessibilityDraftChange}
    <div id={`${uid}-accessibility`}>
      {#key accessibilityDraftKey}
        <DraftLocationAccessibility
          onRemove={() => {
            accessibilityDismissed = true
            accessibilityAdded = false
            onAccessibilityDraftChange?.(undefined)
          }}
          hideHeading={isEditing && visibleFields.includes('accessHint')}
          value={accessibilityDraft ?? {}}
          onChange={onAccessibilityDraftChange}
        />
      {/key}
    </div>
  {:else if accessibilityVisible && accessibilityLocationId}
    <div id={`${uid}-accessibility`}>
      {#key accessibilityLocationId}
        <LocationAccessibility
          onRemove={() => {
            accessibilityDismissed = true
            accessibilityAdded = false
          }}
          hideHeading={isEditing && visibleFields.includes('accessHint')}
          locationId={accessibilityLocationId}
          startEditing={accessibilityAdded}
        />
      {/key}
    </div>
  {/if}
</section>
