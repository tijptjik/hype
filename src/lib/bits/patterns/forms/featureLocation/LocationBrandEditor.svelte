<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SelectField, TextInput } from '#lib/bits/custom/form/index.js'
// DOMAIN
import {
  LocationBrandEditSchema,
  type LocationBrandEdit,
} from '#lib/locations/brandEdit.js'
// TYPES
import type { AcceptedFeatureLocation } from '#lib/db/services/location.js'
import type { LocationBrand } from '#lib/locations/model.js'

let {
  association,
  edit,
  isEditing,
  onChange,
  canInherit = true,
}: {
  association: Pick<AcceptedFeatureLocation, 'revision' | 'brandMode'> & {
    effective: Pick<AcceptedFeatureLocation['effective'], 'brands'>
  }
  canInherit?: boolean
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
    expectedRevision: pending?.expectedRevision ?? association.revision,
    choice,
  })
}

/** Replace one localized name, retaining other locales and source identifiers. */
function rename(index: number, locale: string, value: string): void {
  const next: LocationBrand[] = structuredClone($state.snapshot(brands))
  next[index].names[locale] = value
  change({ mode: 'override', value: next })
}
</script>

<div class="space-y-3 rounded-xl border border-border p-4">
  <SelectField
    id="location-brand-mode"
    label={m.location_brand_title()}
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
  {#if mode === 'override'}
    {#each brands as brand, index}
      <div class="space-y-2 rounded-lg border border-border p-3">
        {#each ['en', 'zh-hant', 'zh-hans'] as locale}
          <TextInput
            id={`location-brand-${index}-${locale}`}
            name=""
            label={locale === 'en'
              ? 'English'
              : locale === 'zh-hant'
                ? '繁體中文'
                : '简体中文'}
            value={brand.names[locale] ?? ''}
            {isEditing}
            onValueChange={value => rename(index, locale, value)}
          />
        {/each}
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
    <p class="text-sm text-muted-foreground">
      {pending
        ? m.location_brand_reset_pending()
        : brands
            .map(brand => Object.values(brand.names).filter(Boolean).join(' · '))
            .join(' / ') || m.location_brand_none()}
    </p>
  {/if}
</div>
