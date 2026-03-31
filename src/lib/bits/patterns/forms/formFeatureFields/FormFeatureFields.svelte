<script lang="ts">
// I18N
import { getLocaleKey, m } from '$lib/i18n'
// BITS
import { TextArea, TextInput } from '$lib/bits/custom/form'
import * as FormI18nSectionPrimitive from '$lib/bits/patterns/forms/formI18nSection/components'
import { FormFacetNav } from '$lib/bits/patterns/forms/formFacetNav'
import { FormFeatureFieldsSection } from '$lib/bits/patterns/forms/formFeatureFieldsSection'
import { FormFeatureSectionHeader } from '$lib/bits/patterns/forms/formFeatureSectionHeader'
// STYLES
import {
  FORM_FEATURE_FIELDS_NON_TRANSLATABLE_HEADER_CLASS,
  FORM_FEATURE_FIELDS_ROOT_CLASS,
  FORM_FEATURE_FIELDS_SECTION_CLASS,
  FORM_FEATURE_FIELDS_TRANSLATABLE_CARD_CLASS,
  FORM_FEATURE_FIELDS_TRANSLATABLE_GRID_CLASS,
  FORM_FEATURE_FIELDS_TRANSLATABLE_SECTION_CLASS,
} from './formFeatureFields.styles'
// TYPES
import type { FormFeatureFieldsProps } from './formFeatureFields.types'

let {
  localeKey,
  locales,
  nonTranslatableItems,
  translatableSpecifierItems,
  isEditing = true,
  previousAction = null,
  nextAction = null,
  onTranslate,
  onResetLocale,
  onToggleGenAI,
  onValueChange,
}: FormFeatureFieldsProps = $props()

function resolvePropertyLabel(
  property: FormFeatureFieldsProps['translatableSpecifierItems'][number],
  locale: FormFeatureFieldsProps['locales'][number],
): string {
  return (
    (property.property?.i18n?.[locale] as { label?: string } | undefined)?.label ??
    (property.property?.i18n?.en as { label?: string } | undefined)?.label ??
    property.property?.key ??
    property.propertyId
  )
}
</script>

<div class={FORM_FEATURE_FIELDS_ROOT_CLASS}>
  {#if nonTranslatableItems.length > 0}
    <div class={FORM_FEATURE_FIELDS_NON_TRANSLATABLE_HEADER_CLASS}>
      <FormFeatureSectionHeader
        title={m.feature__fields_title()}
        subtitle={m.feature__fields_subtitle()}
        issues={[]}
      />
    </div>
    <FormFeatureFieldsSection
      class={FORM_FEATURE_FIELDS_SECTION_CLASS}
      {localeKey}
      items={nonTranslatableItems}
      {isEditing}
    />
  {/if}

  {#if translatableSpecifierItems.length > 0}
    <section class={FORM_FEATURE_FIELDS_TRANSLATABLE_SECTION_CLASS}>
      <FormFeatureSectionHeader
        title={m.feature__translatable_fields_title()}
        subtitle={m.feature__translatable_fields_subtitle()}
        issues={[]}
      />

      <div class={FORM_FEATURE_FIELDS_TRANSLATABLE_GRID_CLASS}>
        {#each locales as locale (locale)}
          <FormI18nSectionPrimitive.FormSection
            {locale}
            cardClass={FORM_FEATURE_FIELDS_TRANSLATABLE_CARD_CLASS}
            {onTranslate}
            {onResetLocale}
            sectionKey="feature-translatable-values"
            {isEditing}
            showTranslationBar={true}
          >
            {#snippet children(locale)}
              <div class="flex flex-col gap-4">
                {#each translatableSpecifierItems as property (property.propertyId)}
                  {@const label = resolvePropertyLabel(property, locale)}
                  {@const translatedValue = property.i18n?.[locale]?.value ?? ''}
                  {@const isTextarea = property.property?.component === 'TextareaField'}

                  {#if isTextarea}
                    <TextArea
                      {label}
                      value={translatedValue}
                      {locale}
                      isTranslated={locale !== getLocaleKey()}
                      isGenAI={Boolean(property.i18n?.[locale]?.valueGen)}
                      {isEditing}
                      onToggleGenAI={() => onToggleGenAI(property.propertyId, locale)}
                      onValueChange={nextValue =>
                        onValueChange(property.propertyId, locale, nextValue)}
                    />
                  {:else}
                    <TextInput
                      {label}
                      value={translatedValue}
                      {locale}
                      isTranslated={locale !== getLocaleKey()}
                      isGenAI={Boolean(property.i18n?.[locale]?.valueGen)}
                      {isEditing}
                      onToggleGenAI={() => onToggleGenAI(property.propertyId, locale)}
                      onValueChange={nextValue =>
                        onValueChange(property.propertyId, locale, nextValue)}
                    />
                  {/if}
                {/each}
              </div>
            {/snippet}
          </FormI18nSectionPrimitive.FormSection>
        {/each}
      </div>
    </section>
  {/if}

  <FormFacetNav {previousAction} {nextAction} />
</div>
