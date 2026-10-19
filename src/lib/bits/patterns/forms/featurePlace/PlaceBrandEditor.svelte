<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SelectField, TextInput } from '#lib/bits/custom/form/index.js'
// DOMAIN
import { PlaceBrandEditSchema, type PlaceBrandEdit } from '#lib/places/brandEdit.js'
// TYPES
import type { AcceptedFeaturePlace } from '#lib/db/services/place.js'
import type { PlaceBrand } from '#lib/places/model.js'

let {
  association,
  edit,
  isEditing,
  onChange,
  canInherit = true,
}: {
  association: Pick<AcceptedFeaturePlace, 'revision' | 'brandMode'> & {
    effective: Pick<AcceptedFeaturePlace['effective'], 'brands'>
  }
  canInherit?: boolean
  edit?: unknown
  isEditing: boolean
  onChange: (edit: PlaceBrandEdit) => void
} = $props()
const parsed = $derived(PlaceBrandEditSchema.safeParse(edit))
const pending = $derived(parsed.success ? parsed.data : null)
const mode = $derived(pending?.choice.mode ?? association.brandMode)
const brands = $derived(
  pending?.choice.mode === 'override'
    ? pending.choice.value
    : (association.effective.brands ?? []),
)
const modes = $derived([
  ...(canInherit ? [{ value: 'inherit', label: m.place_brand_inherit() }] : []),
  { value: 'override', label: m.place_brand_override() },
  { value: 'clear', label: m.place_brand_clear() },
])

/** Keep the first editor revision so refreshed source data cannot silently rebase a draft. */
function change(choice: PlaceBrandEdit['choice']): void {
  if (!isEditing) return
  onChange({
    expectedRevision: pending?.expectedRevision ?? association.revision,
    choice,
  })
}

/** Replace one localized name, retaining other locales and source identifiers. */
function rename(index: number, locale: string, value: string): void {
  const next: PlaceBrand[] = structuredClone($state.snapshot(brands))
  next[index].names[locale] = value
  change({ mode: 'override', value: next })
}
</script>

<div class="space-y-3 rounded-xl border border-border p-4">
  <SelectField
    id="place-brand-mode"
    label={m.place_brand_title()}
    placeholder={m.place_brand_title()}
    triggerAttrs={{ id: 'place-brand-mode' }}
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
            id={`place-brand-${index}-${locale}`}
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
            text={m.place_brand_remove()}
            onClick={() =>
              change({ mode: 'override', value: brands.filter((_, i) => i !== index) })}
          />
        {/if}
      </div>
    {/each}
    {#if isEditing}
      <Button
        type="button"
        text={m.place_brand_add()}
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
        ? m.place_brand_reset_pending()
        : brands
            .map(brand => Object.values(brand.names).filter(Boolean).join(' · '))
            .join(' / ') || m.place_brand_none()}
    </p>
  {/if}
</div>
