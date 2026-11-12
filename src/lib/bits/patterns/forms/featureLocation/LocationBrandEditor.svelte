<script lang="ts">
// LINKED FIELD CONTROLS
import LinkedFieldToggle from '../linkedFields/LinkedFieldToggle.svelte'
import { getLinkedFields } from '../linkedFields/linkedFields.svelte.js'
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
import TagIcon from 'virtual:icons/lucide/tag'
const linkedFields = getLinkedFields()
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import LocationLocaleField from '../localLocationAddress/LocationLocaleField.svelte'
import { SelectField } from '#lib/bits/custom/form/index.js'
// DOMAIN
import {
  LocationBrandEditSchema,
  type LocationBrandEdit,
} from '#lib/locations/brandEdit.js'
// TYPES
import type { ProfileLocaleState } from './profileLocales.js'
import type { AcceptedFeatureLocation } from '#lib/db/services/location.js'
import type { LocationBrand } from '#lib/locations/model.js'

let {
  association,
  edit,
  isEditing,
  onChange,
  canInherit = true,
  localeState,
  translations = true,
  inline = false,
}: {
  association: Pick<AcceptedFeatureLocation, 'version' | 'brandMode'> & {
    effective: Pick<AcceptedFeatureLocation['effective'], 'brands'>
  }
  inline?: boolean
  canInherit?: boolean
  localeState?: ProfileLocaleState
  translations?: boolean
  edit?: unknown
  isEditing: boolean
  onChange: (edit: LocationBrandEdit) => void
} = $props()
const parsed = $derived(LocationBrandEditSchema.safeParse(edit))
const pending = $derived(parsed.success ? parsed.data : null)
const mode = $derived(pending?.choice.mode ?? association.brandMode)
const brands = $derived(
  pending?.choice.mode === 'override'
    ? pending.choice.value
    : pending?.choice.mode === 'clear'
      ? []
      : (association.effective.brands ?? []),
)
const modes = $derived([
  ...(canInherit ? [{ value: 'inherit', label: m.location_brand_inherit() }] : []),
  { value: 'override', label: m.location_brand_override() },
  { value: 'clear', label: m.location_brand_clear() },
])

/** Keep the first editor revision so refreshed source data cannot silently rebase a draft. */
function change(choice: LocationBrandEdit['choice']): void {
  if (!isEditing) return
  onChange({
    expectedRevision: pending?.expectedRevision ?? association.version,
    choice,
  })
}
/** Replace localized names while retaining other brands and source identifiers.
 * @param index Position of the edited brand.
 * @param names Complete language map from the shared locale editor.
 * @returns Nothing; stages an override against the original revision.
 */
function rename(index: number, names: Record<string, string>): void {
  const next: LocationBrand[] = structuredClone($state.snapshot(brands))
  next[index].names = Object.fromEntries(
    Object.entries(names).map(([locale, value]) => [locale.toLowerCase(), value]),
  )
  change({ mode: 'override', value: next })
}
</script>

<section
  hidden={linkedFields && !linkedFields.visible('brands')}
  class="border-border min-w-0 space-y-4 border-t pt-5"
  aria-label={m.location_brand_title()}
>
  <h3 class="flex items-center gap-2 text-base font-semibold">
    <TagIcon class="size-4" aria-hidden="true" />
    {m.location_brand_title()}<LinkedFieldToggle
      field="brands"
      label={m.location_brand_title()}
    />
    {#if inline && isEditing}
      <button
        type="button"
        aria-label={m.location_brand_reset()}
        title={m.location_brand_reset()}
        class="text-muted-foreground hover:text-primary inline-flex size-8 items-center justify-center rounded-md"
        onclick={() => change(canInherit ? { mode: 'inherit' } : { mode: 'clear' })}
      >
        <ResetIcon class="size-4" aria-hidden="true" />
      </button>
    {/if}
  </h3>
  {#if inline && pending?.choice.mode === 'inherit'}
    <p role="status" class="text-muted-foreground text-sm">
      {m.location_brand_reset_pending()}
    </p>
  {/if}
  {#if !inline}
    <SelectField
      triggerClass="bg-transparent! hover:bg-transparent! shadow-none!"
      id="location-brand-mode"
      label={m.location_brand_source()}
      placeholder={m.location_brand_title()}
      triggerAttrs={{ id: 'location-brand-mode' }}
      value={mode}
      items={modes}
      disabled={!isEditing}
      onValueChange={value => {
        if (value === 'override')
          change({ mode: value, value: structuredClone($state.snapshot(brands)) })
        else if (value === 'inherit' || value === 'clear') change({ mode: value })
      }}
    />
  {/if}
  {#if mode === 'override' || inline}
    {#each brands as brand, index}
      <div class="border-border space-y-2 rounded-lg border p-3">
        <LocationLocaleField
          label={m.field_name()}
          value={brand.names}
          {localeState}
          {translations}
          disabled={!isEditing}
          onChange={names => rename(index, names)}
        />
        {#if isEditing}
          <Button
            type="button"
            text={m.location_brand_remove()}
            onClick={() =>
              change({ mode: 'override', value: brands.filter((_, i) => i !== index) })}
          />
        {/if}
      </div>
    {/each}
    {#if isEditing}
      <Button
        type="button"
        text={m.location_brand_add()}
        onClick={() =>
          change({
            mode: 'override',
            value: [...brands, { identifiers: {}, names: { en: '' } }],
          })}
      />
    {/if}
  {:else if mode === 'inherit'}
    <p class="text-muted-foreground text-sm">
      {pending
        ? m.location_brand_reset_pending()
        : brands
            .map(brand => Object.values(brand.names).filter(Boolean).join(' · '))
            .join(' / ') || m.location_brand_none()}
    </p>
  {/if}
</section>
