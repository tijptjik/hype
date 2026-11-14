<script lang="ts">
// TRANSLATION REVIEW
import { MultilingualReview } from '#lib/forms/multilingualReview.svelte.js'
import MultilingualReviewPanel from '../translationReview/MultilingualReviewPanel.svelte'
import TranslationSuggestion from '../translationReview/TranslationSuggestion.svelte'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
import { isGeneratedTranslation } from '#lib/i18n/verification.js'
import { automaticTranslationFromRow } from '#lib/i18n/automaticSchema.js'

// ICONS
import TranslateIcon from 'virtual:icons/lucide/languages'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// BITS
import { TextArea, TextInput } from '#lib/bits/custom/form/index.js'
import * as FormI18nSectionPrimitive from '#lib/bits/patterns/forms/formI18nSection/components/index.js'
import { FormFacetNav } from '#lib/bits/patterns/forms/formFacetNav/index.js'
import { FormFeatureFieldsSection } from '#lib/bits/patterns/forms/formFeatureFieldsSection/index.js'
import { FormFeatureSectionHeader } from '#lib/bits/patterns/forms/formFeatureSectionHeader/index.js'
// STYLES
import {
  FORM_FEATURE_FIELDS_ROOT_CLASS,
  FORM_FEATURE_FIELDS_SECTION_CLASS,
  FORM_FEATURE_FIELDS_TRANSLATABLE_CARD_CLASS,
  FORM_FEATURE_FIELDS_TRANSLATABLE_GRID_CLASS,
  FORM_FEATURE_FIELDS_TRANSLATABLE_SECTION_CLASS,
} from './formFeatureFields.styles'
// TYPES
import type { FormFeatureFieldsProps } from './formFeatureFields.types'

let {
  onReveal,
  onTranslation,
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

let root: HTMLDivElement
const review = new MultilingualReview(
  () =>
    translatableSpecifierItems.flatMap(property =>
      locales.map(locale => ({
        key: `${property.propertyId}:${locale}`,
        field: property.propertyId,
        locale,
        value: property.i18n?.[contentFormKey(locale)]?.value ?? '',
        automatic: automaticTranslationFromRow(
          property.i18n?.[contentFormKey(locale)],
          'value',
        ),
        proposed: automatic =>
          onTranslation?.(property.propertyId, contentFormKey(locale), automatic),
        set: (text, automatic, edited) => {
          if (automatic && onTranslation)
            onTranslation(
              property.propertyId,
              contentFormKey(locale),
              automatic,
              text,
              edited,
            )
          else onValueChange(property.propertyId, contentFormKey(locale), text)
        },
      })),
    ),
  () => isEditing,
  () => onReveal?.(),
)

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

<div bind:this={root} class={FORM_FEATURE_FIELDS_ROOT_CLASS}>
  <MultilingualReviewPanel {review} />
  {#if nonTranslatableItems.length > 0}
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
      >
        {#snippet left()}
          <TranslateIcon class="text-primary size-6" />
        {/snippet}
      </FormFeatureSectionHeader>

      <div class={FORM_FEATURE_FIELDS_TRANSLATABLE_GRID_CLASS}>
        {#each locales as locale (locale)}
          <FormI18nSectionPrimitive.FormSection
            cardClass={FORM_FEATURE_FIELDS_TRANSLATABLE_CARD_CLASS}
            {onTranslate}
            {onResetLocale}
            sectionKey="feature-translatable-values"
            {isEditing}
            showTranslationBar={false}
          >
            {#snippet children()}
              <span class="text-primary text-xs font-semibold">{locale}</span>
              <div class="flex flex-col gap-4">
                {#each translatableSpecifierItems as property (property.propertyId)}
                  {@const label = resolvePropertyLabel(property, locale)}
                  {@const proposalKey = `${property.propertyId}:${locale}`}
                  {@const proposal = review.current(proposalKey)
                    ? review.proposals[proposalKey]
                    : undefined}
                  {@const translatedValue =
                    proposal?.value ??
                    property.i18n?.[contentFormKey(locale)]?.value ??
                    ''}
                  {@const isTextarea = property.property?.component === 'TextareaField'}

                  <div
                    class="[&[data-missing-translation=true]_input]:outline [&[data-missing-translation=true]_input]:outline-1 [&[data-missing-translation=true]_input]:outline-red-600/50 [&[data-missing-translation=true]_textarea]:outline [&[data-missing-translation=true]_textarea]:outline-1 [&[data-missing-translation=true]_textarea]:outline-red-600/50"
                    data-missing-translation={(review.started &&
                      !property.i18n?.[contentFormKey(locale)]?.value?.trim()) ||
                      undefined}
                  >
                    {#if proposal}
                      <TranslationSuggestion
                        value={proposal.value}
                        {label}
                        multiline={isTextarea}
                        onChange={text => {
                          proposal.value = text
                        }}
                        onAccept={edited => review.accept(proposalKey, edited)}
                        onReject={() => review.reject(proposalKey)}
                      />
                    {:else if isTextarea}
                      <TextArea
                        {label}
                        value={translatedValue}
                        isTranslated={locale !== getLocaleKey()}
                        isGenAI={Boolean(
                          proposal ||
                            isGeneratedTranslation(
                              property.i18n?.[contentFormKey(locale)],
                              'value',
                            ),
                        )}
                        {isEditing}
                        onToggleGenAI={() => {
                          if (!proposal)
                            onToggleGenAI(property.propertyId, contentFormKey(locale))
                        }}
                        onValueChange={nextValue => {
                          onValueChange(
                            property.propertyId,
                            contentFormKey(locale),
                            nextValue,
                          )
                        }}
                      />
                    {:else}
                      <TextInput
                        {label}
                        value={translatedValue}
                        isTranslated={locale !== getLocaleKey()}
                        isGenAI={Boolean(
                          proposal ||
                            isGeneratedTranslation(
                              property.i18n?.[contentFormKey(locale)],
                              'value',
                            ),
                        )}
                        {isEditing}
                        onToggleGenAI={() => {
                          if (!proposal)
                            onToggleGenAI(property.propertyId, contentFormKey(locale))
                        }}
                        onValueChange={nextValue => {
                          onValueChange(
                            property.propertyId,
                            contentFormKey(locale),
                            nextValue,
                          )
                        }}
                      />
                    {/if}
                  </div>
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
