<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
// I18N
import { getLocaleKey, m, translateText, toLocaleKey } from '#lib/i18n.js'
// COMPONENTS
import AddressDisplayField from './AddressDisplayField.svelte'
import FormI18nTranslationBar from '../formI18nSection/components/FormI18nTranslationBar.svelte'
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
import UnlockIcon from 'virtual:icons/lucide/lock-keyhole-open'
import AddressNamePicker from './AddressNamePicker.svelte'
import { loadAddressNames, setAddressName } from '#lib/addresses/nameCatalogue.js'
import { ADDRESS_BLOCK_TYPES } from '@saanseoi/address/content'
import AddressBlocks from './AddressBlocks.svelte'
import { Button } from '#lib/bits/core/index.js'
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
// ICONS
import BuildingIcon from 'virtual:icons/lucide/building-2'
import StreetIcon from 'virtual:icons/lucide/road'
import UnitIcon from 'virtual:icons/lucide/door-open'
import LanguagesIcon from 'virtual:icons/lucide/languages'
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
  setAddressOverride,
} from '#lib/addresses/featureAddress.js'
import { addressComponentValue } from '#lib/addresses/presentation.js'
import {
  EDITABLE_ADDRESS_FIELDS,
  setAddressBlock,
  addressBlockTypeLabel,
  getExpressionSuggestions,
  setAddressExpression,
  setStructuredAddressExpression,
  getStructuredAddressType,
} from '#lib/addresses/addressExpressions.js'
import {
  FLOOR_TYPES,
  UNIT_TYPES,
  FloorTypeSchema,
  UnitTypeSchema,
  floorTerms,
  unitTerms,
  addressTerm,
} from '#lib/addresses/address3d.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { EditableAddressField } from '#lib/addresses/addressExpressions.js'
import type { LocaleKey } from '#lib/types.js'
import type { FloorType, UnitType } from '#lib/addresses/address3d.js'

let {
  address,
  isEditing = false,
  translations = $bindable(false),
  hideDisplayAddress = false,
  show3dAddressOptions = true,
  showAccessHints = true,
  hasLocation = true,
  onChange,
}: {
  address: FeatureAddress
  isEditing?: boolean
  translations?: boolean
  hideDisplayAddress?: boolean
  show3dAddressOptions?: boolean
  showAccessHints?: boolean
  hasLocation?: boolean
  onChange: (address: FeatureAddress) => void
} = $props()
let translationActive = true
let translationGeneration = 0
onDestroy(() => {
  translationActive = false
})
$effect(() => {
  // Closing editing permanently retires requests from that editing session.
  if (!isEditing) translationGeneration += 1
})
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
const uid = $props.id()
const locales = ['en', 'zhHant', 'zhHans'] as const

let addedFields = $state<EditableAddressField[]>([])
let explicitFloorType = $state<FloorType | undefined>()
let explicitUnitType = $state<UnitType | undefined>()
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
      (showAccessHints || field !== 'accessHint') &&
      (show3dAddressOptions ||
        !['floorExpression', 'unitExpression', 'unitPortion'].includes(field)),
  ),
)
const visibleFields = $derived(
  availableFields.filter(
    field =>
      field === 'formattedAddress' ||
      addedFields.includes(field) ||
      locales.some(
        locale =>
          Boolean(addressComponentValue(address, locale, field)) ||
          Object.hasOwn(address.overrides[ADDRESS_LOCALES[locale]] ?? {}, field),
      ),
  ),
)
const examples = $derived<Record<EditableAddressField, string>>({
  formattedAddress: m.address_example_display(),
  unitPortion: m.address_example_portion(),
  unitExpression: m.address_example_unit(),
  floorExpression: m.address_example_floor(),
  blockExpression: m.address_example_block(),
  phaseExpression: m.address_example_phase(),
  premisesName: m.address_example_premises(),
  buildingName: m.address_example_building(),
  buildingNumberExpression: m.address_example_number(),
  streetName: m.address_example_street(),
  accessHint: m.address_example_access(),
})
const activeLocales = $derived(translations ? locales : [getLocaleKey()])
// Warm both vocabularies when the address page loads, even before optional fields are enabled.
onMount(() => {
  for (const family of ['streets', 'buildings'] as const)
    void loadAddressNames(family).catch(error =>
      console.error(`Could not preload ${family} names`, error),
    )
})
</script>

<section
  class="min-w-0 space-y-5"
  aria-label={m.feature_address_title()}
  data-address-details
>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-lg font-semibold">{m.feature_address_title()}</h2>
    <button
      type="button"
      class="text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-primary flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm focus-visible:outline-2"
      aria-pressed={translations}
      onclick={() => (translations = !translations)}
    >
      <LanguagesIcon class="size-4" aria-hidden="true" />
      {m.location_address_languages()}
    </button>
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
    {#each activeLocales as locale}
      <div class="space-y-3" lang={ADDRESS_LOCALES[locale]}>
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
    <p class="text-muted-foreground text-sm">
      {show3dAddressOptions
        ? m.address_components_help()
        : m.address_building_components_help()}
    </p>
    <div class="space-y-4">
      {#each visibleFields as field (field)}
        {@const structured = field === 'floorExpression' || field === 'unitExpression'}
        {@const shared = structured || field === 'buildingNumberExpression'}
        <fieldset
          hidden={hideDisplayAddress && field === 'formattedAddress'}
          class="min-w-0 space-y-2"
        >
          <legend class="mb-1 text-sm font-medium">{labels[field]}</legend>
          <div class="grid min-w-0 gap-3">
            {#each shared ? [getLocaleKey()] : activeLocales as locale}
              {@const value =
                field === 'formattedAddress'
                  ? getAddressDisplay(address, locale)
                  : addressComponentValue(address, locale, field)}
              {@const suggestions = getExpressionSuggestions(field, locale)}
              {@const sourceLocales = locales.filter(
                source =>
                  source !== locale &&
                  addressComponentValue(address, source, field).trim(),
              )}
              <div class="flex min-w-0 flex-wrap items-end gap-2">
                {#if translations &&
                  !shared &&
                  ['formattedAddress', 'streetName', 'buildingName'].includes(field)}
                  <span class="text-muted-foreground w-full text-xs"
                    >{locale === 'en'
                      ? 'English'
                      : locale === 'zhHant'
                        ? '繁體中文'
                        : '简体中文'}</span
                  >
                {/if}
                {#if translations &&
                  isEditing &&
                  ['streetName', 'buildingName', 'unitPortion'].includes(field) &&
                  !value.trim() &&
                  sourceLocales.length}
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
                      const [translated] = await translateText(source, target, [
                        sourceValue,
                      ])
                      // Preserve edits and retire callbacks when the originating editor ends.
                      if (
                        translationActive &&
                        isEditing &&
                        generation === translationGeneration &&
                        address === originalAddress &&
                        translated &&
                        !addressComponentValue(address, locale, field).trim() &&
                        addressComponentValue(address, toLocaleKey(source), field) ===
                          sourceValue
                      )
                        onChange(
                          setAddressExpression(address, locale, field, translated),
                        )
                    }}
                  />
                {/if}
                {#if field === 'formattedAddress'}
                  {#if translations}
                    <AddressDisplayField
                      {address}
                      {locale}
                      {isEditing}
                      showLocale={translations}
                      {onChange}
                    />
                  {:else}
                    {@const unlocked = Object.hasOwn(
                      address.overrides[ADDRESS_LOCALES[locale]] ?? {},
                      'formattedAddress',
                    )}
                    <div class="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        aria-label={translations
                          ? `${labels[field]} · ${ADDRESS_LOCALES[locale]}`
                          : labels[field]}
                        {value}
                        readonly={!unlocked}
                        class="border-border bg-input read-only:bg-panel min-w-0 flex-1 rounded-md border px-3 py-2 text-base font-medium"
                        oninput={event =>
                          onChange(
                            setAddressOverride(
                              address,
                              locale,
                              field,
                              event.currentTarget.value,
                            ),
                          )}
                      >
                      <button
                        type="button"
                        aria-label={unlocked
                          ? m.address_display_lock()
                          : m.address_display_unlock()}
                        aria-pressed={unlocked}
                        class="border-border hover:bg-muted rounded-md border p-2"
                        onclick={() =>
                          onChange(
                            setAddressOverride(
                              address,
                              locale,
                              field,
                              unlocked ? undefined : value,
                            ),
                          )}
                      >
                        {#if unlocked}
                          <UnlockIcon class="size-4" />
                        {:else}
                          <LockIcon class="size-4" />
                        {/if}
                      </button>
                    </div>
                  {/if}
                {:else if field === 'streetName' || field === 'buildingName'}
                  <AddressNamePicker
                    {locale}
                    family={field === 'streetName' ? 'streets' : 'buildings'}
                    {value}
                    label={labels[field]}
                    onSelect={record =>
                      field === 'buildingName'
                        ? void selectBuilding(record, locale)
                        : onChange(setAddressName(address, field, record))}
                  />
                {:else}
                  {#if field === 'blockExpression'}
                    {@const block = getAddressLocale(address, locale)}
                    <SelectField
                      label={m.address_block_type()}
                      class="w-32 shrink-0"
                      isEditing={true}
                      items={ADDRESS_BLOCK_TYPES.map(code => ({
                        value: code,
                        label: addressBlockTypeLabel(code, locale),
                      }))}
                      value={String(block.blockType || 'block')}
                      onValueChange={type =>
                        onChange(
                          setAddressBlock(
                            address,
                            locale,
                            String(type),
                            String(block.blockRef || ''),
                            block.blockTypeBeforeNumber === true ||
                              (block.blockTypeBeforeNumber == null && locale === 'en'),
                          ),
                        )}
                    />
                  {/if}
                  {#if field === 'floorExpression'}
                    <SelectField
                      id="address-floorExpression-type"
                      triggerAttrs={{ id: 'address-floorExpression-type' }}
                      label={m.feature_address_floor_type()}
                      class="w-36 shrink-0"
                      isEditing={true}
                      items={FLOOR_TYPES.map(code => ({
                        value: code,
                        label: addressTerm(floorTerms[code], locale),
                      }))}
                      value={getStructuredAddressType(address, field)}
                      onValueChange={code => {
                        explicitFloorType = FloorTypeSchema.parse(code)
                        onChange(
                          setStructuredAddressExpression(
                            address,
                            locale,
                            field,
                            value,
                            explicitFloorType,
                          ),
                        )
                      }}
                    />
                  {:else if field === 'unitExpression'}
                    <SelectField
                      id="address-unitExpression-type"
                      triggerAttrs={{ id: 'address-unitExpression-type' }}
                      label={m.feature_address_unit_type()}
                      class="w-36 shrink-0"
                      isEditing={true}
                      items={UNIT_TYPES.map(code => ({
                        value: code,
                        label: addressTerm(unitTerms[code], locale),
                      }))}
                      value={getStructuredAddressType(address, field)}
                      onValueChange={code => {
                        explicitUnitType = UnitTypeSchema.parse(code)
                        onChange(
                          setStructuredAddressExpression(
                            address,
                            locale,
                            field,
                            value,
                            explicitUnitType,
                          ),
                        )
                      }}
                    />
                  {/if}
                  <TextInput
                    name=""
                    id={`address-${locale}-${field}`}
                    class="min-w-0 flex-1 {shared || translations
                      ? ''
                      : '[&_.bits-form__label]:hidden'}"
                    label={shared
                      ? m.feature_address_shared()
                      : translations
                        ? locale === 'en'
                          ? 'English'
                          : locale === 'zhHant'
                            ? '繁體中文'
                            : '简体中文'
                        : undefined}
                    value={field === 'blockExpression'
                      ? String(getAddressLocale(address, locale).blockRef || '')
                      : value}
                    isEditing={true}
                    placeholder={examples[field]}
                    inputAttrs={{
                      'aria-label':
                        translations && !shared
                          ? `${labels[field]} · ${ADDRESS_LOCALES[locale]}`
                          : labels[field],
                      list: suggestions.length
                        ? `${uid}-${locale}-${field}`
                        : undefined,
                    }}
                    onValueChange={next =>
                      onChange(
                        field === 'blockExpression'
                          ? setAddressBlock(
                              address,
                              locale,
                              String(
                                getAddressLocale(address, locale).blockType || 'block',
                              ),
                              next ?? '',
                              getAddressLocale(address, locale)
                                .blockTypeBeforeNumber === true ||
                                (getAddressLocale(address, locale)
                                  .blockTypeBeforeNumber == null &&
                                  locale === 'en'),
                            )
                          : structured
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
                                  : field === 'unitExpression'
                                    ? explicitUnitType
                                    : undefined,
                              )
                            : setAddressExpression(address, locale, field, next),
                      )}
                  />
                  {#if field === 'blockExpression'}
                    {@const block = getAddressLocale(address, locale)}
                    <label class="flex items-center gap-2 py-2 text-xs"
                      ><input
                        type="checkbox"
                        checked={block.blockTypeBeforeNumber === true ||
                          (block.blockTypeBeforeNumber == null && locale === 'en')}
                        onchange={event =>
                          onChange(
                            setAddressBlock(
                              address,
                              locale,
                              String(block.blockType || 'block'),
                              String(block.blockRef || ''),
                              event.currentTarget.checked,
                            ),
                          )}
                      >{m.address_block_type_first()}</label
                    >
                  {/if}
                {/if}
                {#if suggestions.length}
                  <datalist id={`${uid}-${locale}-${field}`}>
                    {#each suggestions as suggestion}
                      <option value={suggestion}></option>
                    {/each}
                  </datalist>
                {/if}
                {#if field !== 'formattedAddress' &&
                  (structured ||
                    Object.hasOwn(
                      address.overrides[ADDRESS_LOCALES[locale]] ?? {},
                      field,
                    ) ||
                    (field === 'accessHint' &&
                      Object.hasOwn(
                        address.accessHints ?? {},
                        ADDRESS_LOCALES[locale],
                      )))}
                  <Button
                    text={m.feature_address_reset()}
                    style="ghost"
                    size="sm"
                    onClick={() => {
                      addedFields = addedFields.filter(item => item !== field)
                      if (field === 'floorExpression') explicitFloorType = undefined
                      if (field === 'unitExpression') explicitUnitType = undefined
                      onChange(
                        structured
                          ? setStructuredAddressExpression(
                              address,
                              locale,
                              field as
                                | 'floorExpression'
                                | 'unitExpression'
                                | 'unitPortion',
                              undefined,
                            )
                          : setAddressExpression(address, locale, field, undefined),
                      )
                    }}
                  />
                {/if}
              </div>
            {/each}
          </div>
          <p class="text-muted-foreground text-xs">{examples[field]}</p>
        </fieldset>
      {/each}
    </div>
    {#if visibleFields.length < availableFields.length}
      <fieldset class="min-w-0">
        <legend class="text-muted-foreground mb-2 text-sm">
          {m.feature_address_add_detail()}
        </legend>
        <div class="flex flex-wrap gap-2">
          {#each availableFields.filter(
            field => !visibleFields.includes(field),
          ) as field}
            <Button
              text={labels[field]}
              type="button"
              size="sm"
              style="outline"
              onClick={() => (addedFields = [...addedFields, field])}
            />
          {/each}
        </div>
      </fieldset>
    {/if}
  {/if}
</section>
