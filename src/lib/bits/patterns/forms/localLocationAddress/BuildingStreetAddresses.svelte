<script lang="ts">
// ADDRESS
import {
  primaryBuildingStreet,
  type BuildingStreet,
} from '#lib/locations/buildingStreetAddresses.js'
import { parseStreetNumber } from '#lib/addresses/streetNumber.js'
import { ADDRESS_LOCALES } from '#lib/addresses/featureAddress.js'
import { withSimplifiedChinese } from '#lib/addresses/chinese.js'
import type { AddressName } from '#lib/addresses/nameCatalogue.js'
// I18N
import * as m from '#lib/paraglide/messages.js'
// COMPONENTS
import { Button } from '#lib/bits/core/button/index.js'
import { TextInput } from '#lib/bits/custom/form/index.js'
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
import AddressNamePicker from '../formFeatureAddress/AddressNamePicker.svelte'

let {
  rows,
  locales,
  invalid,
  onChange,
  seed,
}: {
  rows: BuildingStreet[]
  locales: string[]
  invalid: boolean
  onChange: (rows: BuildingStreet[]) => void
  seed: () => BuildingStreet | null
} = $props()
const primary = $derived(primaryBuildingStreet(rows))
let reviewedRow = $state<number | null>(null)
const reviewed = $derived(reviewedRow === null ? undefined : rows[reviewedRow])
const reviewedIncomplete = $derived(
  reviewed &&
    Boolean(reviewed.number || Object.keys(reviewed.names).length) &&
    (!reviewed.number.trim() ||
      !parseStreetNumber(reviewed.number).valid ||
      !Object.keys(reviewed.names).length),
)
const showError = $derived(
  invalid &&
    (rows.every(row => row.number && Object.keys(row.names).length) ||
      reviewedIncomplete),
)

/** Keep an existing structured street available when first adding another.
 * @returns Nothing. The Profile Save action commits the resulting draft.
 */
function add(): void {
  reviewedRow = null
  const first = !rows.length ? seed() : null
  onChange([
    ...rows,
    ...(first ? [first] : []),
    { head: null, number: '', names: {}, priority: null },
  ])
}

/** Replace only the edited row, preserving all unshown translations.
 * @param index Edited row. @param change Changed fields. @returns Nothing.
 */
function update(index: number, change: Partial<BuildingStreet>): void {
  onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)))
}

/** Keep custom text in its authored language.
 * @param index Edited street. @param tag Content language. @param value Authored name.
 * @returns Nothing.
 */
function setName(index: number, tag: string, value: string): void {
  const names = { ...rows[index].names }
  if (value) names[tag] = value
  else delete names[tag]
  update(index, { names })
}

/** Replace the street's names together when the editor selects a catalogue record.
 * @param index Edited street. @param record Selected street. @returns Nothing.
 */
function selectStreet(index: number, record: AddressName | null): void {
  const names = Object.fromEntries(
    Object.entries(withSimplifiedChinese(record?.names ?? {})).map(([tag, name]) => [
      tag.toLowerCase(),
      name,
    ]),
  )
  if (!names.en && record?.name) names.en = record.name
  update(index, { names })
}
</script>

<div class="space-y-3">
  {#each rows as row, index (row.head ?? index)}
    <fieldset
      onfocusout={event => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          (!row.number.trim() ||
            !parseStreetNumber(row.number).valid ||
            !Object.keys(row.names).length)
        )
          reviewedRow = index
      }}
      class="border-border/40 flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2 border-b pb-3"
    >
      <legend class="sr-only">
        {m.building_street_row({ number: String(index + 1) })}
      </legend>
      <div class="min-w-0 self-start">
        <div class="flex h-8 items-center px-3 text-sm font-medium">
          {m.address_field_number()}
        </div>
        <TextInput
          name=""
          fitValue={true}
          fitMinWidth="4rem"
          placeholder={m.address_example_number()}
          inputAttrs={{
            'aria-label': m.feature_address_buildingNumberExpression(),
            maxlength: 100,
            'aria-invalid': Boolean(
              showError && (!row.number.trim() || !parseStreetNumber(row.number).valid),
            ),
          }}
          inputClass="h-10 px-3! text-base! font-medium! bg-transparent text-foreground!"
          controlClass="h-12 gap-2 bg-panel! text-foreground"
          class={String.raw`gap-0! w-max min-w-0 max-w-full [&_.bits-form\_\_label]:hidden`}
          value={row.number}
          onValueChange={value => update(index, { number: value ?? '' })}
        />
      </div>
      <div class="max-w-full min-w-0">
        <div class="flex h-8 items-center px-3 text-sm font-medium">
          {m.field_name()}
        </div>
        {#each locales as tag (tag)}
          {@const language = tag.toLowerCase()}
          {@const locale = (['en', 'zhHant', 'zhHans'] as const).find(
            key => ADDRESS_LOCALES[key] === language,
          )}
          <div class="flex min-h-12 min-w-0 items-center gap-2">
            {#if locales.length > 1}
              <span class="text-muted-foreground shrink-0 font-mono text-xs"
                >{shortLocaleLabel(tag)}</span
              >
            {/if}
            {#if locale}
              <AddressNamePicker
                family="streets"
                prominent={true}
                {locale}
                value={row.names[language] ?? ''}
                label={m.feature_address_streetName()}
                onCustom={value => setName(index, language, value)}
                onClear={() => setName(index, language, '')}
                onSelect={record => selectStreet(index, record)}
              />
            {:else}
              <TextInput
                name=""
                value={row.names[language] ?? ''}
                inputAttrs={{
                  'aria-label': m.feature_address_streetName(),
                  lang: tag,
                  maxlength: 500,
                }}
                onValueChange={value => setName(index, language, value ?? '')}
              />
            {/if}
          </div>
        {/each}
      </div>
      <div class="flex min-h-12 flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          style="soft"
          text={primary === row
            ? m.building_street_clear_primary()
            : m.building_street_set_primary()}
          attrs={{ 'aria-pressed': primary === row }}
          onClick={() =>
            onChange(
              rows.map((item, i) => ({
                ...item,
                priority: i === index && primary !== row ? 0 : null,
              })),
            )}
        />
        <Button
          type="button"
          size="sm"
          style="ghost"
          text={m.admin__forms_common_remove()}
          onClick={() => {
            reviewedRow = null
            onChange(rows.filter((_, i) => i !== index))
          }}
        />
      </div>
    </fieldset>
  {/each}
  <Button
    type="button"
    size="sm"
    style="soft"
    text={m.building_street_add()}
    onClick={add}
  />
  {#if showError}
    <p class="text-destructive text-sm" role="status">{m.building_street_invalid()}</p>
  {/if}
</div>
