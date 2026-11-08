<script lang="ts">
// COMPONENTS
import LocalAddressParseReview from './LocalAddressParseReview.svelte'
// DOMAIN
import {
  ADDRESS_BLOCK_TYPES,
  ADDRESS_GRANULARITIES,
  ADDRESS_UNIT_TYPES,
  ADDRESS_FLOOR_TYPES,
} from '#lib/addresses/localLocationAddress.js'
import type { LocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
// I18N
import { formatFloor, formatUnit } from '#lib/addresses/address3d.js'
import { m } from '#lib/i18n.js'

let {
  value = $bindable(),
  disabled = false,
  onParsed,
}: {
  value: LocalLocationAddress
  disabled?: boolean
  onParsed?: (source: Record<string, string>) => void
} = $props()
let locale = $state('en')
const labels = $derived({
  formattedAddress: m.feature_address_formattedAddress(),
  buildingName: m.feature_address_buildingName(),
  buildingNumberExpression: m.feature_address_buildingNumberExpression(),
  buildingNumberFrom: m.feature_address_buildingNumberFrom(),
  buildingNumberTo: m.feature_address_buildingNumberTo(),
  buildingNumberConnector: m.feature_address_buildingNumberConnector(),
  blockExpression: m.feature_address_blockExpression(),
  blockRef: m.feature_address_blockRef(),
  phaseExpression: m.feature_address_phaseExpression(),
  phaseName: m.feature_address_phaseName(),
  phaseRef: m.feature_address_phaseRef(),
  premisesName: m.feature_address_premisesName(),
  streetName: m.feature_address_streetName(),
})
/** Update only the selected locale; preserve all other content and null semantics. */
function setField(key: string, text: string | boolean | null): void {
  value = {
    ...value,
    i18n: {
      ...value.i18n,
      [locale]: { ...(value.i18n[locale] ?? { formattedAddress: '' }), [key]: text },
    },
  }
}
/** Retain exact locale expressions when semantic fields alone cannot reproduce the wording. */
function setUnitExpression(
  key: 'unitExpression' | 'floorExpression' | 'formattedAddressPart',
  text: string,
): void {
  if (!value.unit) return
  const hypeLocale =
    locale === 'zh-hant' ? 'zhHant' : locale === 'zh-hans' ? 'zhHans' : 'en'
  value = {
    ...value,
    unitI18n: {
      ...value.unitI18n,
      [locale]: {
        ...(value.unitI18n[locale] ?? {
          unitExpression: formatUnit(value.unit, hypeLocale),
          floorExpression: formatFloor(value.unit, hypeLocale),
        }),
        [key]: text,
      },
    },
  }
}
</script>

<fieldset {disabled} class="border-border space-y-4 rounded-xl border p-4">
  <legend class="px-2 font-medium">{m.feature__address()}</legend>
  <p class="text-muted-foreground text-sm">{m.location_address_authoring_help()}</p>
  <LocalAddressParseReview bind:value {disabled} {onParsed} />
  <div class="grid gap-3 sm:grid-cols-2">
    <label class="flex flex-col gap-1"
      >{m.location_address_language()}
      <select class="border-border bg-panel rounded-lg border p-2" bind:value={locale}>
        <option value="en">English</option>
        <option value="zh-hant">繁體中文</option>
        <option value="zh-hans">简体中文</option>
      </select>
    </label>
    <label class="flex flex-col gap-1"
      >{m.location_address_granularity()}
      <select
        class="border-border bg-panel rounded-lg border p-2"
        bind:value={value.granularity}
      >
        {#each ADDRESS_GRANULARITIES as kind}
          <option value={kind}>{kind}</option>
        {/each}
      </select>
    </label>
    {#each Object.entries(labels) as [key, label]}
      <label class="flex flex-col gap-1"
        >{label}
        <input
          class="border-border bg-panel rounded-lg border p-2"
          maxlength="4000"
          value={value.i18n[locale]?.[key as keyof typeof labels] ?? ''}
          oninput={event => setField(key, event.currentTarget.value)}
        >
      </label>
    {/each}
    <label class="flex flex-col gap-1"
      >{m.feature_address_blockType()}
      <select
        class="border-border bg-panel rounded-lg border p-2"
        value={value.i18n[locale]?.blockType ?? ''}
        onchange={event => setField('blockType', event.currentTarget.value || null)}
      >
        <option value="">—</option>
        {#each ADDRESS_BLOCK_TYPES as kind}
          <option value={kind}>{kind}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1"
      >{m.feature_address_blockTypeBeforeNumber()}
      <select
        class="border-border bg-panel rounded-lg border p-2"
        value={String(value.i18n[locale]?.blockTypeBeforeNumber ?? '')}
        onchange={event =>
          setField(
            'blockTypeBeforeNumber',
            event.currentTarget.value === ''
              ? null
              : event.currentTarget.value === 'true',
          )}
      >
        <option value="">—</option>
        <option value="true">{m.location_address_before()}</option>
        <option value="false">{m.location_address_after()}</option>
      </select>
    </label>
  </div>
  <label class="flex items-center gap-2">
    <input
      type="checkbox"
      checked={Boolean(value.unit)}
      onchange={event => {
        value = {
          ...value,
          unit: event.currentTarget.checked
            ? {
                unitRef: '',
                unitType: 'U',
                floorRef: '',
                floorType: 'F',
                unitPortion: null,
              }
            : null,
          unitI18n: {},
        }
      }}
    >
    {m.feature_address_unit()}
  </label>
  {#if value.unit}
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1"
        >{m.feature_address_floorExpression()}
        <input
          class="border-border bg-panel rounded-lg border p-2"
          maxlength="4000"
          bind:value={value.unit.floorRef}
          oninput={() => {
            value.unitI18n = {}
          }}
        >
      </label>
      <label class="flex flex-col gap-1"
        >{m.feature_address_floor_type()}
        <select
          class="border-border bg-panel rounded-lg border p-2"
          bind:value={value.unit.floorType}
          onchange={() => {
            value.unitI18n = {}
          }}
        >
          {#each ADDRESS_FLOOR_TYPES as kind}
            <option value={kind}>{kind}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1"
        >{m.feature_address_unitExpression()}
        <input
          class="border-border bg-panel rounded-lg border p-2"
          maxlength="4000"
          bind:value={value.unit.unitRef}
          oninput={() => {
            value.unitI18n = {}
          }}
        >
      </label>
      <label class="flex flex-col gap-1"
        >{m.feature_address_unit_type()}
        <select
          class="border-border bg-panel rounded-lg border p-2"
          bind:value={value.unit.unitType}
          onchange={() => {
            value.unitI18n = {}
          }}
        >
          {#each ADDRESS_UNIT_TYPES as kind}
            <option value={kind}>{kind}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1"
        >{m.feature_address_unitPortion()}
        <input
          class="border-border bg-panel rounded-lg border p-2"
          maxlength="4000"
          value={value.unit.unitPortion ?? ''}
          oninput={event => {
            if (value.unit) value.unit.unitPortion = event.currentTarget.value || null
          }}
        >
      </label>
      {#each ['floorExpression', 'unitExpression', 'formattedAddressPart'] as key}
        <label class="flex flex-col gap-1">
          {key === 'floorExpression'
            ? m.feature_address_floorExpression()
            : key === 'unitExpression'
              ? m.feature_address_unitExpression()
              : m.feature_address_formattedAddress()}
          ({locale})
          <input
            class="border-border bg-panel rounded-lg border p-2"
            maxlength="4000"
            value={value.unitI18n[locale]?.[
              key as 'floorExpression' | 'unitExpression' | 'formattedAddressPart'
            ] ?? ''}
            oninput={event =>
              setUnitExpression(
                key as 'floorExpression' | 'unitExpression' | 'formattedAddressPart',
                event.currentTarget.value,
              )}
          >
        </label>
      {/each}
    </div>
  {/if}
</fieldset>
