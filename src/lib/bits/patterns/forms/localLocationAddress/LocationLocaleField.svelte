<script lang="ts">
// TRANSLATION REVIEW
import { MultilingualReview } from '#lib/forms/multilingualReview.svelte.js'
import MultilingualReviewPanel from '../translationReview/MultilingualReviewPanel.svelte'
import TranslationSuggestion from '../translationReview/TranslationSuggestion.svelte'
// SVELTE
import { flip } from 'svelte/animate'
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
import {
  normalizeContentLocale,
  normalizeContentLocales,
} from '#lib/content-locales/model.js'
// COMPONENTS
import FormI18nInlineRow from '../formI18nSection/components/FormI18nInlineRow.svelte'
import {
  displayedLocales,
  shortLocaleLabel,
} from '#lib/bits/custom/localeControls/localeControls.js'
// TYPES
import type { ProfileLocaleState } from '../featureLocation/profileLocales.js'

let {
  label,
  value,
  localeState,
  translations = false,
  disabled = false,
  onChange,
}: {
  label: string
  value: Record<string, string>
  localeState?: ProfileLocaleState
  translations?: boolean
  disabled?: boolean
  onChange: (value: Record<string, string>) => void
} = $props()
const uid = $props.id()
const canonical = $derived(
  Object.fromEntries(
    Object.entries(value).map(([tag, text]) => [
      normalizeContentLocale(tag) ?? tag,
      text,
    ]),
  ),
)
const locales = $derived(
  normalizeContentLocales([
    ...(localeState?.selectedLocales ?? [getLocaleKey(), 'en', 'zh-Hant', 'zh-Hans']),
    ...Object.keys(value).filter(tag => value[tag]?.trim()),
  ]).filter(tag => !/^und(?:-|$)/i.test(tag)),
)
let reviewVisible = $state(false)
const shown = $derived(
  reviewVisible
    ? locales
    : displayedLocales(
        {
          selectedLocales: locales,
          visibleLocales: localeState
            ? [
                ...localeState.visibleLocales,
                ...locales.filter(tag => !localeState.selectedLocales.includes(tag)),
              ]
            : locales,
        },
        translations,
      ),
)
const review = new MultilingualReview(
  () =>
    locales.map(locale => ({
      key: `${uid}:${locale}`,
      field: uid,
      locale,
      value: canonical[locale] ?? '',
      set: (text: string) => update(locale, text),
    })),
  () => !disabled,
  () => {
    reviewVisible = true
  },
)
let beforeEdit: Record<string, string> = {}

/** Update only the chosen language while retaining hidden and additional translations.
 * @param locale Canonical content language tag.
 * @param text Authored field value.
 * @returns Nothing; stages the complete language map with the parent editor.
 */
function update(locale: string, text: string): void {
  onChange({ ...canonical, [locale]: text })
}
</script>

<fieldset class="min-w-0 space-y-2" data-location-locale-field={label}>
  <MultilingualReviewPanel {review} />
  <legend class="mb-1 min-h-7 text-sm font-medium">{label}</legend>
  {#each shown as locale (locale)}
    {@const reviewKey = `${uid}:${locale}`}
    <div
      animate:flip={{ duration: prefersReducedMotion.current ? 0 : 200 }}
      transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
    >
      <div
        data-missing-translation={(review.started && !canonical[locale]?.trim()) ||
          undefined}
      >
        {#if review.current(reviewKey)}
          <TranslationSuggestion
            value={review.proposals[reviewKey].value}
            {label}
            prefix={shortLocaleLabel(locale)}
            onChange={text => {
              review.proposals[reviewKey].value = text
            }}
            onAccept={edited => review.accept(reviewKey, edited)}
            onReject={() => review.reject(reviewKey)}
          />
        {:else}
          <FormI18nInlineRow
            value={canonical[locale] ?? ''}
            label={translations || reviewVisible
              ? `${label} · ${shortLocaleLabel(locale)}`
              : label}
            prefix={translations || reviewVisible ? shortLocaleLabel(locale) : ''}
            editable={!disabled}
            showVerification={false}
            required={false}
            issues={undefined}
            attrs={{
              id: `${uid}-${locale}`,
              // The parent serializes this draft through its registered remote fields.
              name: '',
              maxlength: 1000,
              oninput: (event: Event) =>
                update(locale, (event.currentTarget as HTMLInputElement).value),
            }}
            onStart={() => {
              beforeEdit[locale] = canonical[locale] ?? ''
            }}
            onCancel={() => update(locale, beforeEdit[locale] ?? '')}
            onClear={() => update(locale, '')}
          />
        {/if}
      </div>
    </div>
  {/each}
</fieldset>
