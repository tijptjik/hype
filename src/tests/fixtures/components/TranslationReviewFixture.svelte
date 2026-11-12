<script lang="ts">
const hubReview = new URLSearchParams(location.search).has('hub')

import FeatureProfileEditor from '#lib/bits/patterns/forms/featureLocation/FeatureProfileEditor.svelte'
import FormI18nInlineRow from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nInlineRow.svelte'
import AutomaticTranslationIndicator from '#lib/bits/custom/text/AutomaticTranslationIndicator.svelte'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
import type { ProfileLocaleState } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import type { ProfileValues } from '#lib/bits/patterns/forms/featureLocation/profileTranslation.js'
const legacy = new URLSearchParams(location.search).has('legacy')
const fallback = new URLSearchParams(location.search).has('fallback')
const filled = new URLSearchParams(location.search).has('filled')
let active = $state('title')
let saved = $state(0)
let values = $state<ProfileValues>({
  en: {
    title: fallback ? '' : 'A community kitchen',
    description: 'Everyone is welcome.',
    titleGen: false,
    descriptionGen: false,
  },
  zhHant: {
    title: legacy || filled || fallback ? 'Existing AI title' : '',
    titleGen: legacy || filled || fallback,
    description: filled ? 'AI description' : '',
    descriptionGen: filled,
  },
  ja: {
    title: filled ? 'AI title' : '',
    description: filled ? 'AI description' : '',
    titleGen: filled,
    descriptionGen: filled,
  },
})
let locales = $state<ProfileLocaleState>({
  selectedLocales: ['en', 'zh-Hant', 'ja'],
  visibleLocales: ['en'],
  expanded: false,
})
</script>
<main
  class="bg-panel text-foreground min-h-screen p-4"
  data-review-fixture
  data-active={active}
  data-saved={saved}
  data-values={JSON.stringify(values)}
  data-expanded={locales.expanded}
>
  <form
    onsubmit={event => {
      event.preventDefault()
      saved += 1
    }}
  >
    {#each ['title', 'description'] as tab}
      <section hidden={active !== tab}>
        <FeatureProfileEditor
          {hubReview}
          localeState={locales}
          onLocaleStateChange={state => {
            locales = state
          }}
          {values}
          fieldConfigs={[{ key: tab as 'title' | 'description', label: tab }]}
          contextKey="translation-review-fixture"
          isEditing
          onReveal={() => {
            active = tab
          }}
          translate={async (_source, target, text) => {
            await new Promise(resolve => setTimeout(resolve, 500))
            return { status: 'translated', text: `${target}: ${text}` }
          }}
          onTranslated={(field, locale, text) => {
            const key = contentFormKey(locale)
            values = {
              ...values,
              [key]: { ...values[key], [field]: text, [`${field}Gen`]: false },
            }
          }}
        >
          {#snippet children(field, locale, onEditStart, prefix)}
            {@const key = contentFormKey(locale)}
            <FormI18nInlineRow
              value={values[key]?.[field] ?? ''}
              label={`${field} ${locale}`}
              {prefix}
              editable
              showVerification={false}
              attrs={{
                name: `${field}.${key}`,
                oninput: (event: Event) => {
                  values = {
                    ...values,
                    [key]: {
                      ...values[key],
                      [field]: (event.currentTarget as HTMLInputElement).value,
                    },
                  }
                },
              }}
              issues={undefined}
              required={false}
              onStart={onEditStart}
              onCancel={() => {}}
              onClear={() => {}}
            />
          {/snippet}
        </FeatureProfileEditor>
      </section>
    {/each}
    <button
      data-header-save
      type="submit"
      class="border-border bg-panel fixed top-3 right-4 z-50 rounded border p-3"
    >
      Save record
    </button>
  </form>
  <p>
    Japanese label
    <AutomaticTranslationIndicator
      resolution={{
        value: '翻訳',
        locale: 'ja',
        kind: 'automatic',
        original: { value: 'Original kitchen label', locale: 'en' },
      }}
    />
  </p>
  <output data-values={JSON.stringify(values)}></output>
</main>
