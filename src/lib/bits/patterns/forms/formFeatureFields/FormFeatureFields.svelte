<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// TRANSLATION
import { translateContentField } from '#lib/api/translation.remote.js'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
import {
  registerTranslationReview,
  completeTranslationReview,
  type TranslationReviewSection,
} from '#lib/forms/translationReview.js'
import { automaticTranslationFromRow } from '#lib/i18n/automaticSchema.js'
import type { AutomaticTranslation } from '#lib/i18n/automatic.js'

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
let reviewing = $state(false)
let busy = $state(false)
let translationError = $state('')
let proposals = $state<
  Record<
    string,
    {
      propertyId: string
      locale: string
      value: string
      automatic: AutomaticTranslation
    }
  >
>({})
const missing = $derived(
  translatableSpecifierItems.flatMap(property => {
    const source = locales.find(locale => {
      const row = property.i18n?.[contentFormKey(locale)]
      return row?.value?.trim() && row.valueGen !== true && row.valueGen !== 'true'
    })
    return source
      ? locales
          .filter(locale => !property.i18n?.[contentFormKey(locale)]?.value?.trim())
          .map(locale => ({ property, locale, source }))
      : []
  }),
)
const reviewSection: TranslationReviewSection = {
  fingerprint: () =>
    JSON.stringify([
      locales,
      translatableSpecifierItems.map(property => property.i18n),
    ]),
  missing: () => isEditing && missing.length > 0,
  open: () => {
    reviewing = true
    onReveal?.()
    void tick().then(() => root?.scrollIntoView?.({ block: 'nearest' }))
  },
}
$effect(() => {
  const form = root?.closest('form')
  if (form && isEditing) return registerTranslationReview(form, reviewSection)
})

$effect(() => {
  if (!reviewing) return
  for (const { property, locale } of missing) {
    const automatic = automaticTranslationFromRow(
      property.i18n?.[contentFormKey(locale)],
      'value',
    )
    const key = `${property.propertyId}:${locale}`
    if (
      automatic &&
      !proposals[key] &&
      property.i18n?.[contentFormKey(automatic.sourceLocale)]?.value ===
        automatic.sourceText
    )
      proposals[key] = {
        propertyId: property.propertyId,
        locale,
        value: automatic.value,
        automatic,
      }
  }
})

/** Generate proposals for missing active languages, preserving both source and target edits.
 * @returns Completion of sequential field requests.
 */
async function propose(): Promise<void> {
  busy = true
  translationError = ''
  try {
    for (const { property, locale, source } of missing) {
      if (proposals[`${property.propertyId}:${locale}`]) continue
      const text = property.i18n?.[contentFormKey(source)]?.value ?? ''
      const result = await translateContentField({ source, target: locale, text })
      const current = translatableSpecifierItems.find(
        row => row.propertyId === property.propertyId,
      )
      if (
        result.status !== 'translated' ||
        current?.i18n?.[contentFormKey(source)]?.value !== text ||
        current?.i18n?.[contentFormKey(locale)]?.value?.trim()
      )
        continue
      proposals[`${property.propertyId}:${locale}`] = {
        propertyId: property.propertyId,
        locale,
        value: result.text,
        automatic: result.automatic,
      }
      onTranslation?.(property.propertyId, contentFormKey(locale), result.automatic)
    }
  } catch {
    translationError = m.address_translate_error()
  } finally {
    busy = false
  }
}

/** Promote one current suggestion only after the editor selects Accept.
 * @param key Stable property and language identity. @returns Nothing.
 */
function accept(key: string): void {
  const proposal = proposals[key]
  if (!proposal?.value.trim()) return
  const current = translatableSpecifierItems.find(
    row => row.propertyId === proposal.propertyId,
  )
  if (
    current?.i18n?.[contentFormKey(proposal.automatic.sourceLocale)]?.value !==
      proposal.automatic.sourceText ||
    current?.i18n?.[contentFormKey(proposal.locale)]?.value?.trim()
  )
    return
  onTranslation?.(
    proposal.propertyId,
    contentFormKey(proposal.locale),
    proposal.automatic,
    proposal.value,
  )
  delete proposals[key]
}

/** Finish the Fields tab after an explicit decision and flushed native form state.
 * @param approve Accept every current suggestion when true. @returns Completion of the review step.
 */
async function finish(approve: boolean): Promise<void> {
  if (approve) Object.keys(proposals).forEach(accept)
  await tick()
  if (approve && missing.length) return
  reviewing = false
  const form = root?.closest('form')
  if (form) completeTranslationReview(form, reviewSection)
}

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
  {#if translationError}
    <p role="alert" class="text-error text-sm">{translationError}</p>
  {/if}
  {#if reviewing}
    <div class="mb-4 flex flex-wrap items-center gap-3 text-sm" role="status">
      <span>{m.translation_review_missing({ count: missing.length })}</span>
      <button type="button" disabled={busy} onclick={() => void propose()}>
        {m.translation_review_generate()}
      </button>
      <button
        type="button"
        disabled={busy || (missing.length > 0 && !Object.keys(proposals).length)}
        onclick={() => void finish(true)}
      >
        {m.translation_review_accept_all()}
      </button>
      <button type="button" disabled={busy} onclick={() => void finish(false)}>
        {m.translation_review_keep_empty()}
      </button>
    </div>
  {/if}
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

      {#if isEditing && !reviewing && missing.length}
        <button
          type="button"
          class="text-primary mb-3 text-sm"
          onclick={() => {
            reviewSection.open()
            void propose()
          }}
        >
          {m.translation_review_generate()}
        </button>
      {/if}
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
                  {@const proposal = proposals[proposalKey]}
                  {@const translatedValue =
                    proposal?.value ??
                    property.i18n?.[contentFormKey(locale)]?.value ??
                    ''}
                  {@const isTextarea = property.property?.component === 'TextareaField'}

                  {#if isTextarea}
                    <TextArea
                      {label}
                      value={translatedValue}
                      isTranslated={locale !== getLocaleKey()}
                      isGenAI={Boolean(
                        proposal || property.i18n?.[contentFormKey(locale)]?.valueGen,
                      )}
                      {isEditing}
                      onToggleGenAI={() => {
                        if (!proposal)
                          onToggleGenAI(property.propertyId, contentFormKey(locale))
                      }}
                      onValueChange={nextValue => {
                        if (proposal) proposal.value = nextValue
                        else
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
                        proposal || property.i18n?.[contentFormKey(locale)]?.valueGen,
                      )}
                      {isEditing}
                      onToggleGenAI={() => {
                        if (!proposal)
                          onToggleGenAI(property.propertyId, contentFormKey(locale))
                      }}
                      onValueChange={nextValue => {
                        if (proposal) proposal.value = nextValue
                        else
                          onValueChange(
                            property.propertyId,
                            contentFormKey(locale),
                            nextValue,
                          )
                      }}
                    />
                  {/if}
                  {#if proposal}
                    <button
                      type="button"
                      class="text-primary text-sm"
                      onclick={() => accept(proposalKey)}
                    >
                      {m.translation_review_accept()}
                    </button>
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
