<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { Select } from '#lib/bits/core/index.js'
// ADDRESS
import { localAddressContent } from '#lib/addresses/locationDraft.js'
import { customAddressType } from '#lib/addresses/addressExpressions.js'
import {
  FLOOR_TYPES,
  UNIT_TYPES,
  FloorTypeSchema,
  UnitTypeSchema,
  floorTerms,
  unitTerms,
  addressTerm,
  parseFloorReference,
  parseUnitReference,
} from '#lib/addresses/address3d.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { LocaleKey } from '#lib/types.js'
import type { AssociationUnitEdits } from '#lib/locations/associationAddress.js'

let {
  address,
  group,
  locale,
  label,
  onChange,
  onBlur,
}: {
  address: FeatureAddress
  group: 'floor' | 'unit'
  locale: LocaleKey
  label: string
  onChange: (value: AssociationUnitEdits) => void
  onBlur: () => void
} = $props()
let root: HTMLDivElement
let input: HTMLInputElement
let selectOpen = false
let pointerDown = false
let blurTimer: ReturnType<typeof setTimeout>
const details = $derived(localAddressContent(address).unit)
const type = $derived(
  group === 'floor' ? (details?.floorType ?? 'F') : (details?.unitType ?? 'U'),
)
const reference = $derived(
  group === 'floor' ? (details?.floorRef ?? '') : (details?.unitRef ?? ''),
)
let draft = $state<string | null>(null)
const items = $derived(
  group === 'floor'
    ? FLOOR_TYPES.map(value => ({
        value,
        label: addressTerm(floorTerms[value], locale),
      }))
    : UNIT_TYPES.map(value => ({
        value,
        label: addressTerm(unitTerms[value], locale),
      })),
)
onMount(() => input?.focus())
onDestroy(() => clearTimeout(blurTimer))

/** Store shared references with the regular address editor's parsing and type vocabulary.
 * @param value Reference draft. @param code Explicit type selection. @returns Nothing.
 */
function update(value: string, code: string = type): void {
  if (group === 'floor') {
    const parsed = parseFloorReference(value, FloorTypeSchema.parse(code))
    onChange({ floor: { type: parsed.floorType, reference: parsed.floorRef } })
  } else {
    const parsed = parseUnitReference(value, UnitTypeSchema.parse(code))
    onChange({
      unit: {
        type: parsed.unitType,
        reference: parsed.unitRef,
        locale,
        customType: customAddressType(address, locale, 'unitExpression'),
      },
    })
  }
}
/** Keep the editor mounted while its portalled type menu owns keyboard focus.
 * @returns Nothing; leaving both controls returns to the display value.
 */
function finish(): void {
  clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    if (!pointerDown && !selectOpen && !root.contains(document.activeElement)) onBlur()
  }, 0)
}
</script>

<svelte:window
  onpointerdown={() => (pointerDown = true)}
  onpointerup={() => {
    pointerDown = false
    finish()
  }}
  onpointercancel={() => {
    pointerDown = false
    finish()
  }}
/>
<div
  bind:this={root}
  class="flex min-w-0 flex-wrap items-center gap-1.5"
  onfocusout={finish}
>
  <Select
    value={type}
    {items}
    triggerAttrs={{
      'aria-label':
        group === 'floor'
          ? m.feature_address_floor_type()
          : m.feature_address_unit_type(),
    }}
    triggerClass="inline-flex! w-auto! items-center! h-auto! min-h-9! max-w-full! gap-0! sm:gap-1! rounded border-border! bg-background! px-2! sm:px-3! py-1! text-[11px]! sm:text-xs! [&_svg]:hidden! sm:[&_svg]:block! [&_svg]:size-3! [&_span]:pl-0! [&_span]:whitespace-normal! [&_span]:break-normal!"
    contentClass="text-foreground!"
    onOpenChange={open => {
      selectOpen = open
      if (!open) finish()
    }}
    onValueChange={code => {
      update(draft ?? reference, code)
      draft = null
    }}
  />
  <input
    bind:this={input}
    value={draft ?? reference}
    aria-label={label}
    autocomplete="off"
    maxlength="1000"
    class="border-border bg-background focus-visible:outline-primary h-9 min-w-0 flex-1 basis-12 rounded border px-2 text-sm font-semibold focus-visible:outline-2"
    oninput={event => {
      draft = event.currentTarget.value
      update(draft)
    }}
    onblur={() => {
      draft = null
    }}
    onkeydown={event => {
      if (!event.isComposing && (event.key === 'Enter' || event.key === 'Escape')) {
        event.preventDefault()
        event.stopPropagation()
        onBlur()
      }
    }}
  >
  {#if group === 'unit' && type === 'X'}
    <input
      value={customAddressType(address, locale, 'unitExpression')}
      aria-label={m.address_custom_unit_type()}
      class="border-border bg-background focus-visible:outline-primary h-9 w-full min-w-0 rounded border px-2 text-sm focus-visible:outline-2"
      oninput={event =>
        onChange({
          unit: { type: 'X', reference, locale, customType: event.currentTarget.value },
        })}
    >
  {/if}
</div>
