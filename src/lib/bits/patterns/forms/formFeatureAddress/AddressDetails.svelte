<script lang="ts">
// ADDRESS LOCALES
import { addressLocaleLabel } from './addressLocaleLabel.js'
// SVELTE
import { onMount, onDestroy, tick, type Snippet } from 'svelte'
import { slide, type SlideParams, type TransitionConfig } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
import { MediaQuery } from 'svelte/reactivity'
// I18N
import { getLocaleKey, m, translateText, toLocaleKey } from '#lib/i18n.js'
// COMPONENTS
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
import AddressDisplayField from './AddressDisplayField.svelte'
import { ADDRESS_BLOCK_TYPES } from '@saanseoi/address/content'
import AddressBlocks from './AddressBlocks.svelte'
import { Button } from '#lib/bits/core/index.js'
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
// ICONS
import SearchIcon from 'virtual:icons/lucide/search'
import LoaderIcon from 'virtual:icons/lucide/loader-circle'
import UnitIcon from 'virtual:icons/lucide/door-open'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
import SwapIcon from 'virtual:icons/lucide/arrow-left-right'
import XIcon from 'virtual:icons/lucide/x'
import InfoIcon from 'virtual:icons/lucide/info'
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
import type { EditableAddressField } from '#lib/addresses/addressExpressions.js'
import type { Locale, LocaleKey } from '#lib/types.js'
import type { FloorType } from '#lib/addresses/address3d.js'

let {
  address,
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
  details: BuildingDetails
  locale: LocaleKey
  streets: AddressName[]
} | null>(null)
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
  buildingFailed = false
  buildingLoading = Boolean(record?.release)
  const selectedAddress = setAddressName(address, 'buildingName', record)
  const selectionSignature = (draft: FeatureAddress): string =>
    JSON.stringify(
      Object.keys(ADDRESS_LOCALES).map(
        key => getAddressLocale(draft, key as LocaleKey).buildingName,
      ),
    )
  const expectedSelection = selectionSignature(selectedAddress)
  onChange(selectedAddress)
  if (!record?.release) return
  try {
    const [details, streets] = await Promise.all([
      loadBuildingDetails(record.id, record.release),
      loadAddressNames('streets').catch(() => []),
    ])
    if (
      request !== buildingRequest ||
      selectionSignature(address) !== expectedSelection
    )
      return
    buildingSelection = { name: record, details, locale, streets }
    onChange(
      fillBuildingDetails(
        address,
        record,
        details,
        details.addresses.length === 1 ? details.addresses[0] : undefined,
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
  const { name, details, locale, streets } = buildingSelection
  onChange(
    fillBuildingDetails(
      address,
      name,
      details,
      candidate,
      hasLocation,
      locale,
      streets,
    ),
  )
  buildingSelection = null
}
// Address selectors use the neutral menu surface, including the portalled viewport and options.
const addressSelectContentClass =
  'bg-panel! [&>div]:bg-transparent! [&_[role=option]]:bg-transparent! [&_[role=option][data-highlighted]]:bg-foreground/5! [&_[role=option][data-state=checked]]:bg-foreground/5!'
const uid = $props.id()
let accessHintBeforeEdit = $state<Partial<Record<LocaleKey, string>>>({})
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
const activeLocales = $derived(translations ? locales : [getLocaleKey()])
const hasOtherLocaleOverrides = $derived(
  locales.some(
    locale =>
      locale !== getLocaleKey() &&
      Object.entries(address.overrides[ADDRESS_LOCALES[locale]] ?? {}).some(
        ([field, value]) =>
          value !== undefined &&
          value !==
            (field === 'formattedAddress'
              ? getAddressDisplay(
                  setAddressOverride(address, locale, 'formattedAddress', undefined),
                  locale,
                  divisions,
                )
              : getAddressLocale({ ...address, overrides: {} }, locale)[
                  field as keyof ReturnType<typeof getAddressLocale>
                ]),
      ),
  ),
)

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
function accessHintValue(locale: LocaleKey): string {
  return address.accessHints?.[ADDRESS_LOCALES[locale]] ?? ''
}
const accessHintSources = $derived(
  locales.filter(locale => accessHintValue(locale).trim()),
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
  const sourceKey = toLocaleKey(source as Locale)
  const text = accessHintValue(sourceKey)
  const targets = locales.filter(
    locale => locale !== sourceKey && !accessHintValue(locale).trim(),
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
        const [translated] = await translateText(
          source as Locale,
          ADDRESS_LOCALES[locale],
          [text],
        )
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
      next = setAddressExpression(next, locale, 'accessHint', translated)
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
    triggerClass="h-12 min-h-12 w-full! gap-2 rounded-md bg-panel! text-foreground! [&_*]:text-foreground! px-2"
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
        type="button"
        aria-label={unchanged && !emptySource
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
        {#if unchanged && !emptySource}
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
      <button
        type="button"
        class="text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-primary flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm focus-visible:outline-2"
        class:text-primary={hasOtherLocaleOverrides}
        data-tooltip={hasOtherLocaleOverrides
          ? m.address_other_locale_overrides()
          : undefined}
        aria-pressed={translations}
        onclick={() => (translations = !translations)}
      >
        <LanguagesIcon class="size-4" aria-hidden="true" />
        {m.location_address_languages()}
        {#if hasOtherLocaleOverrides}
          <span
            role="img"
            aria-label={m.address_other_locale_overrides()}
            class="bg-primary size-1.5 rounded-full"
          ></span>
        {/if}
      </button>
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
    {#each activeLocales as locale (locale)}
      <div
        transition:localeSlide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
        class="space-y-3"
        lang={ADDRESS_LOCALES[locale]}
      >
        {#if translations}
          <p class="text-muted-foreground text-xs">{ADDRESS_LOCALES[locale]}</p>
        {/if}
        <p class="text-xl leading-relaxed font-medium" data-address-display>
          {getAddressDisplay(address, locale) || '—'}
        </p>
        <AddressBlocks {address} {locale} includeDivisions={false} />
        {#if showAccessHints && addressComponentValue(address, locale, 'accessHint')}
          <p class="text-muted-foreground text-sm">
            {addressComponentValue(address, locale, 'accessHint')}
          </p>
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
            {#each locales.filter(locale => locale !== getLocaleKey()) as locale}
              <AddressDisplayField
                {locationKind}
                {divisions}
                {address}
                {locale}
                {isEditing}
                showLocale={true}
                compact={true}
                scrollWhenConstrained={true}
                {onChange}
              />
            {/each}
          </div>
        </fieldset>
      {/if}
      {#each visibleGroups as { fields: group, title }, groupIndex (group[0])}
        <div
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
          <div class="flex min-w-0 flex-wrap items-start gap-4" data-address-field-row>
            {#each group as field (field)}
              {@const structured =
                field === 'floorExpression' || field === 'unitExpression'}
              {@const shared = structured || field === 'buildingNumberExpression'}
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
                        locale: ADDRESS_LOCALES[locale],
                        label: addressLocaleLabel(locale),
                        accessibleLabel: `${labels.accessHint}: ${m.address_translate_from()} ${addressLocaleLabel(locale)}`,
                      }))}
                      hasTargets={accessHintSources.length < locales.length}
                      busy={accessHintTranslationSource !== null}
                      busySource={accessHintTranslationSource ?? undefined}
                      onTranslate={source => void translateAccessHints(source)}
                    />
                  </legend>
                  {#if accessHintTranslationFailed}
                    <p role="alert" class="text-destructive text-xs">
                      {m.address_translate_error()}
                    </p>
                  {/if}
                  {#each activeLocales as locale (locale)}
                    <div
                      class="pt-2 first-of-type:pt-0"
                      transition:localeSlide={{
                        duration: prefersReducedMotion.current ? 0 : 200,
                      }}
                    >
                      <FormI18nInlineRow
                        value={accessHintValue(locale)}
                        label={translations
                          ? `${labels.accessHint} · ${addressLocaleLabel(locale)}`
                          : labels.accessHint}
                        prefix={translations ? addressLocaleLabel(locale) : ''}
                        editable={isEditing}
                        showVerification={false}
                        required={false}
                        issues={undefined}
                        attrs={{
                          id: `${uid}-${locale}-access-hint`,
                          placeholder: examples.accessHint(
                            {},
                            { locale: ADDRESS_LOCALES[locale] },
                          ),
                          oninput: (event: Event) =>
                            onChange(
                              setAddressExpression(
                                address,
                                locale,
                                field,
                                (event.currentTarget as HTMLInputElement).value,
                              ),
                            ),
                        }}
                        onStart={() => {
                          accessHintBeforeEdit[locale] = accessHintValue(locale)
                        }}
                        onCancel={() =>
                          onChange(
                            setAddressExpression(
                              address,
                              locale,
                              field,
                              accessHintBeforeEdit[locale] ?? '',
                            ),
                          )}
                        onClear={() =>
                          onChange(setAddressExpression(address, locale, field, ''))}
                      />
                    </div>
                  {/each}
                </fieldset>
              {:else}
                <fieldset
                  class="group/subsection w-max min-w-0 max-w-full flex-initial space-y-2 {structured ||
                  field === 'blockExpression' ||
                  field === 'buildingNumberExpression'
                    ? 'shrink-0!'
                    : ''}"
                >
                  <legend
                    class="mb-1 flex flex-wrap items-center gap-2 font-medium {field ===
                    'formattedAddress'
                      ? 'text-xs text-muted-foreground'
                      : 'text-sm'}"
                  >
                    <span class="flex min-h-7 items-center gap-2 whitespace-nowrap"
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
                        addressComponentValue(address, locale, field).trim(),
                      )}
                      {@const target = activeLocales.find(
                        locale => !addressComponentValue(address, locale, field).trim(),
                      )}
                      {#if sources.length && target}
                        <span class="inline-flex align-middle [&>div]:min-h-7">
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
                  <!-- The fieldset legend owns the label; inline controls must not reserve a second label row. -->
                  <div
                    use:animateAddressColumns={field === 'blockExpression' ||
                      field === 'phaseExpression'}
                    class="grid min-w-0 {field === 'blockExpression'
                      ? 'grid-cols-[max-content_max-content_max-content]'
                      : field === 'phaseExpression'
                        ? 'grid-cols-[max-content_max-content]'
                        : ''}"
                  >
                    {#each shared ? [getLocaleKey()] : activeLocales as locale (locale)}
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
                      {@const suggestions = getExpressionSuggestions(field, locale)}
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
                            : examples[field]({}, { locale: ADDRESS_LOCALES[locale] })}
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
                            {onChange}
                          />
                        {:else if field === 'streetName' || field === 'buildingName'}
                          {@const sourceLocales = locales.filter(
                            source =>
                              source !== locale &&
                              addressComponentValue(address, source, field).trim(),
                          )}
                          {#if field === 'buildingName' &&
                            translations &&
                            !value &&
                            sourceLocales.length}
                            <div class="flex min-h-12 items-center gap-2">
                              <span
                                class="text-muted-foreground w-[3em] shrink-0 font-mono text-xs"
                                >{addressLocaleLabel(locale)}</span
                              >
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
                                    !addressComponentValue(address, locale, field) &&
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
                                showLocale={translations}
                                family={field === 'streetName'
                                  ? 'streets'
                                  : 'buildings'}
                                {value}
                                label={labels[field]}
                                onClear={field === 'streetName'
                                  ? () =>
                                      onChange(
                                        setAddressOverride(
                                          address,
                                          locale,
                                          'streetName',
                                          null,
                                        ),
                                      )
                                  : undefined}
                                onReplacingChange={replacing =>
                                  (replacingNames[`${locale}-${field}`] = replacing)}
                                onSelect={record =>
                                  field === 'buildingName'
                                    ? void selectBuilding(record, locale)
                                    : onChange(setAddressName(address, field, record))}
                              />
                            </div>
                          {/if}
                        {:else}
                          {#if field === 'blockExpression' && blockTypeFirst(locale)}
                            {@render blockTypeSelect(locale)}
                          {/if}
                          {#if field === 'phaseExpression'}
                            <SelectField
                              contentClass={addressSelectContentClass}
                              triggerAttrs={{
                                'aria-label': m.feature_address_phaseExpression(),
                              }}
                              triggerClass="h-12 min-h-12 w-full! gap-2 rounded-md bg-panel! text-foreground! [&_*]:text-foreground! px-2"
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
                                explicitFloorType = FloorTypeSchema.parse(code)
                                const reference =
                                  floorDraft ?? addressFloorReference(address, locale)
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
                              value={customAddressType(address, locale, field)}
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
                            getAddressLocale(address, locale).blockType === 'other'}
                            <TextInput
                              name=""
                              class="order-last col-span-full w-full"
                              inputClass="h-10 px-3! text-base! font-medium! bg-transparent text-foreground! placeholder:text-muted-foreground/65!"
                              controlClass="bg-panel! text-foreground"
                              isEditing={true}
                              value={customAddressType(address, locale, field)}
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
                            prefix={translations && !shared
                              ? addressLocaleLabel(locale)
                              : undefined}
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
                                  getAddressPresentationLocale(address, locale)
                                    .blockRef || '',
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
                                field === 'buildingNumberExpression' && numberError
                                  ? true
                                  : undefined,
                              'aria-describedby':
                                field === 'buildingNumberExpression' && numberError
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
                                      getStructuredAddressType(address, field),
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
                                  : setAddressExpression(address, locale, field, next),
                              )
                            }}
                          />
                          {#if field === 'buildingNumberExpression' && numberError}
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
                                  <SwapIcon class="size-4" aria-hidden="true" />
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
          </div>
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
