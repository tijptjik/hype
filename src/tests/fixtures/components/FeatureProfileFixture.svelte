<script lang="ts">
import { untrack } from 'svelte'
// COMPONENTS
import SectionHeaderIssues from '#lib/bits/custom/form/src/sectionHeader/components/SectionHeaderIssues.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import FeatureProfileEditor from '#lib/bits/patterns/forms/featureLocation/FeatureProfileEditor.svelte'
import FormI18nDescriptorFields from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nDescriptorFields.svelte'
// CONTENT
import { contentFormKey } from '#lib/i18n/contentRecords.js'
import { getContentLocaleRecord } from '#lib/content-locales/catalogue.js'
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import type { ProfileProviderResult } from '#lib/bits/patterns/forms/featureLocation/profileTranslation.js'

let {
  retainContent = false,
  toolbarIssue = '',
  provider = async (
    _source: string,
    target: string,
    text: string,
  ): Promise<ProfileProviderResult> => ({
    status: 'translated',
    text: `${target}: ${text}`,
  }),
}: {
  toolbarIssue?: string
  retainContent?: boolean
  provider?: (
    source: string,
    target: string,
    text: string,
  ) => Promise<ProfileProviderResult>
} = $props()
let loading = $state(false)
let isEditing = $state(true)
let inherited = $state(false)
let editedLocation = $state(false)
let values = $state<
  Record<
    string,
    {
      title?: string
      description?: string
      titleGen?: boolean
      descriptionGen?: boolean
    }
  >
>({
  en: {
    title: '',
    description: '<p>A quiet place to meet <strong>neighbours</strong>.</p>',
    titleGen: true,
    descriptionGen: true,
  },
  zhHant: { title: '', description: '', titleGen: true, descriptionGen: false },
  zhHans: { title: '', description: '保留內容', titleGen: true, descriptionGen: false },
})
let localeState = $state(
  untrack(() => restoreProfileLocales(['en', 'zh-Hant', 'zh-Hans', 'ja'], values)),
)
let context = $state(0)
let checkpoint = ''
const form = {
  fields: {
    value: () => ({ data: { i18n: values } }),
    set: (value: { data?: { i18n?: typeof values } }) => {
      if (value.data?.i18n) values = value.data.i18n
    },
  },
}
function fields(locale: string) {
  return Object.fromEntries(
    ['title', 'description', 'titleGen', 'descriptionGen'].map(key => [
      key,
      {
        as: (type: string, value?: string) => ({
          name: `data.i18n.${locale}.${key}`,
          value: value ?? values[locale]?.[key as keyof typeof values.en] ?? '',
          ...(type === 'text'
            ? {
                oninput: (event: Event) => {
                  const target = event.target as HTMLInputElement
                  values[locale] = { ...values[locale], [key]: target.value }
                },
              }
            : { type }),
        }),
        issues: () => undefined,
      },
    ]),
  )
}
</script>
<main
  class="bits-theme bg-panel text-foreground min-h-screen py-8"
  data-profile-fixture
>
  <form onsubmit={event => event.preventDefault()}>
    <FormSurface>
      <FeatureProfileEditor
        {loading}
        {retainContent}
        {localeState}
        onLocaleStateChange={value => (localeState = value)}
        values={values as import('#lib/bits/patterns/forms/featureLocation/profileTranslation.js').ProfileValues}
        contextKey={`fixture:${context}`}
        recordKey={String(context)}
        {inherited}
        {isEditing}
        offerName={!inherited}
        locationNames={{
          en: 'Fu Yee Court',
          'zh-Hant': '富怡閣',
          'zh-Hans': '富怡阁',
          ja: '富怡コート',
        }}
        onUseName={() => {
          inherited = true
          values.en.title = 'Fu Yee Court'
          values.zhHant.title = '富怡閣'
          values.zhHans.title = '富怡阁'
          values.ja = { ...values.ja, title: '富怡コート' }
        }}
        onIndependentName={() => (inherited = false)}
        onEditLocation={() => (editedLocation = true)}
        translate={provider}
        onTranslated={(field, target, text) => {
          const key = contentFormKey(target)
          values[key] = { ...values[key], [field]: text, [`${field}Gen`]: true }
        }}
      >
        {#snippet toolbarMessage()}
          <SectionHeaderIssues issues={toolbarIssue ? [toolbarIssue] : []} />
        {/snippet}
        {#snippet children(field, locale, onEditStart, prefix)}
          {@const key = contentFormKey(locale)}
          {@const language = getContentLocaleRecord(locale, 'en')}
          <FormI18nDescriptorFields
            {form}
            fields={fields(key)}
            locale={key}
            {isEditing}
            isRequiredInPreflight={() => false}
            inline
            {onEditStart}
            fieldConfigs={[
              {
                key: field,
                label: prefix,
                ariaLabel: `${field} ${locale}`,
                kind: field === 'title' ? 'input' : 'textarea',
                readonly: field === 'title' && inherited,
              },
            ]}
          />
        {/snippet}
      </FeatureProfileEditor>
    </FormSurface>
  </form>
  <button
    type="button"
    onclick={async () => {
      retainContent = true
      loading = true
      await new Promise(resolve => setTimeout(resolve, 400))
      context++
      values.en.description = 'Next record description'
      loading = false
    }}
  >
    Next record
  </button>
  <button type="button" onclick={() => (loading = !loading)}>Toggle loading</button>
  <button type="button" onclick={() => (isEditing = !isEditing)}>Toggle editing</button>
  <button
    type="button"
    onclick={() => (checkpoint = JSON.stringify({ values, localeState }))}
  >
    Checkpoint draft
  </button>
  <button
    type="button"
    onclick={() => {
      const saved = JSON.parse(checkpoint)
      context++
      values = saved.values
      localeState = restoreProfileLocales(['en'], saved.values, saved.localeState)
    }}
  >
    Recover draft
  </button>
  <output
    data-profile-state={JSON.stringify({
      inherited,
      editedLocation,
      values,
      localeState,
    })}
  ></output>
</main>
