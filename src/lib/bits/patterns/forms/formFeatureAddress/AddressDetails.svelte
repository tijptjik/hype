<script lang="ts">
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// COMPONENTS
import AddressNamePicker from './AddressNamePicker.svelte'
import { setAddressName } from '#lib/addresses/nameCatalogue.js'
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
import UnlockIcon from 'virtual:icons/lucide/lock-keyhole-open'
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
  show3dAddressOptions = true,
  showAccessHints = true,
  onChange,
}: {
  address: FeatureAddress
  isEditing?: boolean
  show3dAddressOptions?: boolean
  showAccessHints?: boolean
  onChange: (address: FeatureAddress) => void
} = $props()
const uid = $props.id()
const locales = ['en', 'zhHant', 'zhHans'] as const
let translations = $state(false)
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
      class="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
      aria-pressed={translations}
      onclick={() => (translations = !translations)}
    >
      <LanguagesIcon class="size-4" aria-hidden="true" />
      {m.location_address_languages()}
    </button>
  </div>
  {#if !isEditing}
    {#each activeLocales as locale}
      <div class="space-y-3" lang={ADDRESS_LOCALES[locale]}>
        {#if translations}
          <p class="text-xs text-muted-foreground">{ADDRESS_LOCALES[locale]}</p>
        {/if}
        <p class="text-xl font-medium leading-relaxed" data-address-display>
          {getAddressDisplay(address, locale) || '—'}
        </p>
        <AddressBlocks {address} {locale} includeDivisions={false} />
        {#if showAccessHints && addressComponentValue(address, locale, 'accessHint')}
          <p class="text-sm text-muted-foreground">
            {addressComponentValue(address, locale, 'accessHint')}
          </p>
        {/if}
      </div>
    {/each}
  {:else}
    <p class="text-sm text-muted-foreground">
      {show3dAddressOptions
        ? m.address_components_help()
        : m.address_building_components_help()}
    </p>
    <div class="space-y-4">
      {#each visibleFields as field (field)}
        {@const structured = field === 'floorExpression' || field === 'unitExpression'}
        {@const shared = structured || field === 'buildingNumberExpression'}
        <fieldset class="min-w-0 space-y-2">
          <legend class="mb-1 text-sm font-medium">{labels[field]}</legend>
          <div class="grid min-w-0 gap-3">
            {#each shared ? [getLocaleKey()] : activeLocales as locale}
              {@const value =
                field === 'formattedAddress'
                  ? getAddressDisplay(address, locale)
                  : addressComponentValue(address, locale, field)}
              {@const suggestions = getExpressionSuggestions(field, locale)}
              <div class="flex min-w-0 flex-wrap items-end gap-2">
                {#if translations &&
                  !shared &&
                  ['formattedAddress', 'streetName', 'buildingName'].includes(field)}
                  <span class="w-full text-xs text-muted-foreground"
                    >{locale === 'en'
                      ? 'English'
                      : locale === 'zhHant'
                        ? '繁體中文'
                        : '简体中文'}</span
                  >
                {/if}
                {#if field === 'formattedAddress'}
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
                      class="min-w-0 flex-1 rounded-md border border-border bg-input px-3 py-2 text-base font-medium read-only:bg-panel"
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
                      class="rounded-md border border-border p-2 hover:bg-muted"
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
                {:else if field === 'streetName' || field === 'buildingName'}
                  <AddressNamePicker
                    family={field === 'streetName' ? 'streets' : 'buildings'}
                    {value}
                    label={labels[field]}
                    onSelect={record =>
                      onChange(setAddressName(address, field, record))}
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
          <p class="text-xs text-muted-foreground">{examples[field]}</p>
        </fieldset>
      {/each}
    </div>
    {#if visibleFields.length < availableFields.length}
      <fieldset class="min-w-0">
        <legend class="mb-2 text-sm text-muted-foreground">
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
