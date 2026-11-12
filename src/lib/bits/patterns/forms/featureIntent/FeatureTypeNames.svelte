<script lang="ts">
import { featureTypeLabelValue } from '#lib/features/intents.js'
// SVELTE
import { getContext, untrack } from 'svelte'
import {
  translationReviewGroupKey,
  type TranslationReviewGroup,
} from '#lib/forms/translationReviewGroup.js'
import {
  translationSource,
  type TranslationSourceMode,
} from '#lib/forms/translationSource.js'
import TranslationSuggestion from '../translationReview/TranslationSuggestion.svelte'
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
import { cubicInOut } from 'svelte/easing'
// COMPONENTS
import Label from '#lib/bits/custom/form/src/label/Label.svelte'
import FormI18nSourceBar from '../formI18nSection/components/FormI18nSourceBar.svelte'
import FormI18nInlineRow from '../formI18nSection/components/FormI18nInlineRow.svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { getContentLocaleRecord } from '#lib/content-locales/catalogue.js'
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
// API
import { translateContentField } from '#lib/api/translation.remote.js'
// TYPES
import type { FeatureType } from '#lib/features/intents.js'
let {
  type = $bindable(),
  locales,
  reviewLocales = locales,
  reviewGroup = getContext<TranslationReviewGroup | undefined>(
    translationReviewGroupKey,
  ),
  multilingual,
  disabled = false,
  onEnglishChange,
}: {
  type: FeatureType
  locales: string[]
  reviewLocales?: string[]
  reviewGroup?: TranslationReviewGroup
  multilingual: boolean
  disabled?: boolean
  onEnglishChange?: (before: string, after: string) => void
} = $props()
let reviewElement: HTMLDivElement
let busy = $state<string | undefined>()
let error = $state('')
let beforeEdit = ''
const sources = $derived(
  locales
    .filter(locale => value(locale).trim())
    .map(locale => {
      const record = getContentLocaleRecord(locale, getLocaleKey())
      return {
        locale,
        label: record.autonym,
        accessibleLabel: m.profile_translate_source({ language: record.name }),
      }
    }),
)
/** Resolve a localized display name with the legacy English fallback.
 * @param locale Content language. @returns Current draft text.
 */
function value(locale: string): string {
  return featureTypeLabelValue(type, locale)
}
/** Update only the selected locale, retaining hidden translations.
 * @param locale Content language. @param text Draft name. @returns Nothing.
 */
function update(locale: string, text: string): void {
  if (locale === 'en') onEnglishChange?.(value(locale), text)
  type.labels = { ...type.labels, [locale]: text }
  if (locale === 'en') type.label = text
}
/** Translate empty targets without replacing concurrent edits or a replaced draft.
 * @param source Source language. @returns Completion of the translation batch.
 */
async function translate(source: string): Promise<void> {
  if (disabled || busy) return
  const draft = type
  const text = value(source)
  const targets = locales.filter(locale => locale !== source && !value(locale).trim())
  busy = source
  error = ''
  try {
    // Apply only to the unchanged draft and still-empty destination fields.
    await Promise.all(
      targets.map(async target => {
        const result = await translateContentField({ source, target, text })
        if (
          type !== draft ||
          disabled ||
          value(source) !== text ||
          value(target).trim()
        )
          return
        if (result.status === 'translated') update(target, result.text)
        else error = result.message
      }),
    )
  } catch {
    error = 'Unable to translate display names. Please try again.'
  } finally {
    busy = undefined
  }
}

let reviewing = $state(false)
let proposals = $state<
  Record<string, { text: string; source: string; sourceText: string }>
>({})
const missing = $derived(
  disabled ||
    !Object.keys({ en: type.label, ...type.labels }).some(locale =>
      value(locale).trim(),
    )
    ? []
    : reviewLocales.filter(locale => !value(locale).trim()),
)
/** Check that a suggestion still matches its source and empty target.
 * @param locale Target language. @returns Whether the suggestion may be accepted.
 */
function current(locale: string): boolean {
  const proposal = proposals[locale]
  return (
    !!proposal?.text.trim() &&
    !value(locale).trim() &&
    value(proposal.source) === proposal.sourceText
  )
}
/** Accept a current suggestion into the existing type draft.
 * @param locale Target language. @returns Nothing.
 */
function accept(locale: string): void {
  if (!current(locale)) return
  update(locale, proposals[locale].text)
  delete proposals[locale]
}
/** Generate reviewable names without overwriting existing or concurrently edited values.
 * @param mode Source preference. @param progress Completion or fallback notice callback.
 * @returns Completion of sequential translations.
 */
async function generate(
  mode: TranslationSourceMode = 'nearest',
  progress?: (fallback?: boolean) => void,
): Promise<void> {
  if (disabled || busy) return
  reviewElement?.scrollIntoView?.({ block: 'center' })
  error = ''
  const draft = type
  try {
    for (const target of [...missing].filter(locale => !current(locale))) {
      const source = translationSource(
        target,
        Object.keys({ en: type.label, ...type.labels }).filter(locale =>
          value(locale).trim(),
        ),
        mode,
      )
      if (!source) continue
      busy = source
      if (mode === 'english' && !source.startsWith('en')) progress?.(true)
      const text = value(source)
      const result = await translateContentField({ source, target, text })
      if (
        draft === type &&
        !disabled &&
        value(source) === text &&
        !value(target).trim() &&
        result.status === 'translated'
      )
        proposals[target] = { text: result.text, source, sourceText: text }
      else if (result.status !== 'translated') error = result.message
      progress?.()
    }
  } catch {
    error = 'Unable to translate display names. Please try again.'
  } finally {
    busy = undefined
  }
}
$effect(() => {
  if (!reviewGroup || disabled) return
  return untrack(() =>
    reviewGroup.register({
      outstandingKeys: () => missing.map(locale => `${type.id}:label:${locale}`),
      missing: () => missing.length > 0,
      missingKeys: () =>
        missing
          .filter(locale => !current(locale))
          .map(locale => `${type.id}:label:${locale}`),
      fingerprint: () =>
        JSON.stringify([type.id, type.labels, type.label, reviewLocales]),
      open: () => {
        reviewing = true
      },
      remaining: () => missing.filter(locale => !current(locale)).length,
      generate,
      ready: () => missing.every(current),
      pending: () => missing.some(current),
      acceptFilled: () => {
        for (const locale of [...missing]) accept(locale)
      },
      finish: async accepted => {
        if (accepted) for (const locale of [...missing]) accept(locale)
      },
    }),
  )
})
</script>
<div bind:this={reviewElement} class="grid min-w-0" data-type-names>
  <Label text="Display name" />
  <FormI18nSourceBar
    visible={multilingual && !disabled && sources.length > 0}
    {sources}
    label={m.profile_translate_from()}
    busy={Boolean(busy)}
    busySource={busy}
    disabled={disabled || Boolean(busy)}
    hasTargets={locales.some(locale => !value(locale).trim())}
    onTranslate={source => void translate(source)}
  />
  <div class="mt-2">
    {#each locales as locale, index (locale)}
      <!-- Include row spacing in the slide so the naming rules move continuously. -->
      <div
        class={index > 0 ? 'pt-2' : ''}
        transition:slide={{
          duration: prefersReducedMotion.current ? 0 : 200,
          easing: cubicInOut,
        }}
      >
        <div
          data-missing-translation={(reviewing && !value(locale).trim()) || undefined}
        >
          {#if current(locale)}
            <TranslationSuggestion
              value={proposals[locale]?.text ?? ''}
              label={`Display name ${locale}`}
              prefix={multilingual ? shortLocaleLabel(locale) : ''}
              onChange={text => {
                if (proposals[locale]) proposals[locale].text = text
              }}
              onAccept={() => accept(locale)}
              onReject={() => {
                delete proposals[locale]
              }}
            />
          {:else}
            <FormI18nInlineRow
              value={value(locale)}
              label={multilingual ? `Display name ${locale}` : 'Display name'}
              prefix={multilingual ? shortLocaleLabel(locale) : ''}
              editable={!disabled}
              showVerification={false}
              required={false}
              issues={undefined}
              attrs={{
                lang: locale,
                dir: 'auto',
                maxlength: 80,
                oninput: (event: Event) =>
                  update(locale, (event.currentTarget as HTMLInputElement).value),
              }}
              onStart={() => (beforeEdit = value(locale))}
              onCancel={() => update(locale, beforeEdit)}
              onClear={() => update(locale, '')}
            />
          {/if}
        </div>
      </div>
    {/each}
  </div>
  {#if error}
    <p role="alert" class="text-destructive text-xs">{error}</p>
  {/if}
</div>
