<script lang="ts" generics="T extends DescriptorData">
// SVELTE
import { untrack, type Snippet } from 'svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
import { getContentLocaleRecord } from '#lib/content-locales/catalogue.js'
import { contentLocaleOptions } from '../contentLocaleDefaults/contentLocaleOptions.js'
// COMPONENTS
import FeatureProfileEditor from '../featureLocation/FeatureProfileEditor.svelte'
import FormI18nDescriptorFields from './components/FormI18nDescriptorFields.svelte'
import { restoreProfileLocales } from '../featureLocation/profileLocales.js'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
// TYPES
import type { FormDataUpdaterForm } from '#lib/client/services/form.types.js'
import type { DescriptorData } from './components/formI18nDescriptorFields.types.js'
import type { ProfileProviderResult } from '../featureLocation/profileTranslation.js'
import type { ProfileLocaleState } from '../featureLocation/profileLocales.js'

type DescriptorField = 'name' | 'nameShort' | 'description'

let {
  form,
  fields,
  defaultLocales,
  recordKey,
  resetVersion = 0,
  isEditing = false,
  isRequiredInPreflight,
  translate,
  onChange,
  stickyToolbar = false,
  children,
}: {
  form: FormDataUpdaterForm<T>
  fields: Record<string, object>
  defaultLocales: string[]
  recordKey: string
  resetVersion?: number
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  translate: (
    source: string,
    target: string,
    text: string,
  ) => Promise<ProfileProviderResult>
  onChange: () => void
  stickyToolbar?: boolean
  children?: Snippet<[ProfileLocaleState]>
} = $props()

const configs = $derived([
  {
    key: 'name' as const,
    label: m.admin__forms_common_name_full(),
    kind: 'input' as const,
  },
  {
    key: 'nameShort' as const,
    label: m.admin__forms_common_name_short(),
    kind: 'input' as const,
  },
  {
    key: 'description' as const,
    label: m.feature__description(),
    kind: 'textarea' as const,
  },
])
const values = $derived(form.fields.value().data?.i18n ?? {})
// The locale controller retains every stored language, including short-name-only records.
const localeValues = $derived(
  Object.fromEntries(
    Object.entries(values).map(([locale, row]) => [
      locale,
      {
        title: row?.name || row?.nameShort || row?.subscriptionBenefits,
        description: row?.description,
      },
    ]),
  ),
)
let localeState = $state(
  untrack(() => restoreProfileLocales(defaultLocales, localeValues)),
)
$effect(() => {
  recordKey
  resetVersion
  localeState = untrack(() => restoreProfileLocales(defaultLocales, localeValues))
})
$effect(() => {
  const stored = localeValues
  localeState = untrack(() =>
    restoreProfileLocales(defaultLocales, stored, localeState),
  )
})

/** Apply a successful translation without changing other fields or their verification.
 * @param field Descriptor field filled by the translation job.
 * @param locale Canonical target language tag.
 * @param text Translated text supplied by the provider.
 * @returns Nothing; stages the value in the existing remote form and revalidates it.
 */
function applyTranslation(field: DescriptorField, locale: string, text: string): void {
  const current = form.fields.value()
  if (!current.data) return
  const key = contentFormKey(locale)
  form.fields.set({
    ...current,
    data: {
      ...current.data,
      i18n: {
        ...current.data.i18n,
        [key]: {
          ...current.data.i18n?.[key],
          [field]: text,
          [`${field}Gen`]: true,
        },
      },
    },
  })
  onChange()
}
</script>

<div data-profile-locale-scope>
  <div
    class="z-[220] mb-6 border-b border-border/50 bg-[var(--form-workspace,var(--color-panel))] px-6 pb-3 pt-4 {stickyToolbar
      ? 'sticky top-0'
      : ''}"
    data-profile-locale-toolbar
  >
    <!-- Descriptor schemas own their locale set; the toolbar controls order and visibility. -->
    <LocaleToolbar
      {...localeState}
      options={contentLocaleOptions(getLocaleKey())}
      allowAdd={false}
      onExpandedChange={expanded => {
        localeState = { ...localeState, expanded }
      }}
      onChange={change => {
        localeState = { ...localeState, ...change }
      }}
    />
  </div>
  <FeatureProfileEditor
    stackNames
    showToolbar={false}
    {localeState}
    onLocaleStateChange={state => {
      localeState = state
    }}
    {values}
    {recordKey}
    contextKey={`${recordKey}:${resetVersion}:${isEditing}`}
    {isEditing}
    fieldConfigs={configs}
    {translate}
    onTranslated={applyTranslation}
  >
    {#snippet children(field, locale, onEditStart, prefix)}
      {@const key = contentFormKey(locale)}
      {@const config = configs.find(config => config.key === field)!}
      {@const language = getContentLocaleRecord(locale, getLocaleKey())}
      <FormI18nDescriptorFields
        {form}
        fields={fields[key]}
        locale={key}
        {isEditing}
        inline
        {onEditStart}
        fieldConfigs={[
          { ...config, label: prefix, ariaLabel: `${config.label} · ${language.name}` },
        ]}
        {isRequiredInPreflight}
      />
    {/snippet}
  </FeatureProfileEditor>
  {@render children?.(localeState)}
</div>
