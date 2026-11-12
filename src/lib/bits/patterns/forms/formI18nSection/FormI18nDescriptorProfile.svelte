<script lang="ts" generics="T extends DescriptorData">
// SVELTE
import { untrack, type Snippet } from 'svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
import { getContentLocaleRecord } from '#lib/content-locales/catalogue.js'
import { contentLocaleOptions } from '../contentLocaleDefaults/contentLocaleOptions.js'
// ICONS
import DescriptionsIcon from 'virtual:icons/lucide/file-text'
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import FeatureProfileEditor from '../featureLocation/FeatureProfileEditor.svelte'
import FormI18nDescriptorFields from './components/FormI18nDescriptorFields.svelte'
import { restoreProfileLocales } from '../featureLocation/profileLocales.js'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import type { AutomaticTranslation } from '#lib/i18n/automatic.js'
// TYPES
import type {
  FormDataUpdaterForm,
  GenAiField,
} from '#lib/client/services/form.types.js'
import type {
  DescriptorData,
  DescriptorFieldConfig,
} from './components/formI18nDescriptorFields.types.js'
import type { ProfileProviderResult } from '../featureLocation/profileTranslation.js'
import type { LocaleSelection } from '#lib/bits/custom/localeControls/localeControls.types.js'
import type { ProfileLocaleState } from '../featureLocation/profileLocales.js'

type DescriptorField = GenAiField

let {
  hubReview,
  form,
  fields,
  defaultLocales,
  recordKey,
  resetVersion = 0,
  isEditing = false,
  allowAddLocales = false,
  isRequiredInPreflight,
  translate,
  onChange,
  onReveal,
  stickyToolbar = false,
  horizontalToolbar = false,
  stickyFieldHeaders = false,
  showPrimaryLocaleHeader = true,
  localeHeaderPlacement = 'above',
  children,
  expanded = $bindable(false),
  localeSelection = $bindable<LocaleSelection | null>(null),
  fieldConfigs,
  stackNames = true,
  renderValue,
  toolbarHeader,
  afterField,
}: {
  hubReview?: boolean
  form: FormDataUpdaterForm<T>
  fields: Record<string, object>
  defaultLocales: string[]
  recordKey: string
  resetVersion?: number
  isEditing?: boolean
  /** Enable only for entity schemas that accept dynamic content languages. */
  allowAddLocales?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  translate: (
    source: string,
    target: string,
    text: string,
  ) => Promise<ProfileProviderResult>
  onChange: () => void
  onReveal?: () => void
  stickyToolbar?: boolean
  /** Keep languages in one scrollable row inside a responsive section header. */
  horizontalToolbar?: boolean
  stickyFieldHeaders?: boolean | ReadonlyArray<DescriptorField>
  showPrimaryLocaleHeader?: boolean
  localeHeaderPlacement?: 'above' | 'gutter'
  children?: Snippet<[ProfileLocaleState]>
  /** Form-owned language order and visibility shared across tabs. */
  localeSelection?: LocaleSelection | null
  expanded?: boolean
  fieldConfigs?: DescriptorFieldConfig[]
  stackNames?: boolean
  /** Render the locale controls inside an owning section header. */
  toolbarHeader?: Snippet<[Snippet]>
  renderValue?: Snippet<[GenAiField, string]>
  /** Render shared descriptor controls within their field column. */
  afterField?: Snippet<[GenAiField]>
} = $props()

const configs = $derived(
  fieldConfigs ?? [
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
  ],
)
const values = $derived(form.fields.value().data?.i18n ?? {})
// Retain configured content languages, including policy-only and short-name-only records.
const localeValues = $derived(
  Object.fromEntries(
    Object.entries(values).map(([locale, row]) => [
      locale,
      {
        title: [
          ...(
            [
              'name',
              'nameShort',
              'description',
              'privacyPolicy',
              'termsOfService',
            ] as const
          ).map(field => row?.[field] ?? ''),
          row?.subscriptionBenefits ?? '',
        ].join('\n'),
        description: '',
      },
    ]),
  ),
)
let localLocaleState = $state(
  untrack(() => restoreProfileLocales(defaultLocales, localeValues)),
)
const localeState = $derived(
  localeSelection
    ? restoreProfileLocales(defaultLocales, localeValues, {
        ...localeSelection,
        expanded,
      })
    : localLocaleState,
)
const displayLocaleState = $derived({ ...localeState, expanded })
// Wrapped language chips change the sticky offset on narrow screens and on expansion.
let toolbarHeight = $state(0)
$effect(() => {
  recordKey
  resetVersion
  localLocaleState = untrack(() => restoreProfileLocales(defaultLocales, localeValues))
})
$effect(() => {
  const stored = localeValues
  localLocaleState = untrack(() =>
    restoreProfileLocales(defaultLocales, stored, localLocaleState),
  )
})

/** Apply a successful translation without changing other fields or their verification.
 * @param field Descriptor field filled by the translation job.
 * @param locale Canonical target language tag.
 * @param text Translated text supplied by the provider.
 * @returns Nothing; stages the value in the existing remote form and revalidates it.
 */
function applyTranslation(
  field: DescriptorField,
  locale: string,
  text: string,
  automatic?: AutomaticTranslation,
  humanVerified = false,
): void {
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
          [`${field}Gen`]: false,
          ...(automatic || current.data.i18n?.[key]?.[`${field}Gen`]
            ? {
                translationProvenance: {
                  ...current.data.i18n?.[key]?.translationProvenance,
                  [field]: JSON.stringify({
                    ...(automatic ?? {
                      origin: 'legacy-ai',
                      value: current.data.i18n?.[key]?.[field] ?? text,
                    }),
                    humanVerified,
                    acceptedValue: text,
                    acceptedBy: 'pending',
                    acceptedAt: new Date().toISOString(),
                  }),
                },
              }
            : {}),
        },
      },
    },
  })
  onChange()
}
/** Stage automatic metadata without filling the published field.
 * @param field Target field. @param locale Target language. @param automatic Signed provider result.
 * @returns Nothing; uses the existing form transport.
 */
function stageAutomatic(
  field: DescriptorField,
  locale: string,
  automatic: AutomaticTranslation,
): void {
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
          autoTranslated: {
            ...current.data.i18n?.[key]?.autoTranslated,
            [field]: JSON.stringify(automatic),
          },
        },
      },
    },
  })
  onChange()
}
</script>

<div
  data-profile-locale-scope
  style:--profile-locale-toolbar-height={`${stickyToolbar ? toolbarHeight : 0}px`}
>
  <div
    class="z-[220] mb-4 bg-[var(--form-workspace,var(--color-panel))] {stickyToolbar
      ? 'sticky top-0'
      : ''}"
    bind:offsetHeight={toolbarHeight}
    data-profile-locale-toolbar
  >
    {#snippet localeToolbar()}
      <!-- The owning entity enables additions only when its save schema supports them. -->
      <LocaleToolbar
        {...displayLocaleState}
        horizontal={horizontalToolbar}
        options={contentLocaleOptions(getLocaleKey())}
        allowAdd={isEditing && allowAddLocales}
        onExpandedChange={value => {
          expanded = value
        }}
        onChange={change => {
          // Register a complete empty descriptor bucket before mounting its controls.
          if (change.action === 'add') {
            const current = form.fields.value()
            const key = contentFormKey(change.locale)
            if (current.data && !current.data.i18n?.[key]) {
              form.fields.set({
                ...current,
                data: {
                  ...current.data,
                  i18n: {
                    ...current.data.i18n,
                    [key]: {
                      name: '',
                      nameShort: '',
                      description: '',
                      subscriptionBenefits: '',
                      privacyPolicy: '',
                      termsOfService: '',
                      nameGen: false,
                      nameShortGen: false,
                      descriptionGen: false,
                      subscriptionBenefitsGen: false,
                      privacyPolicyGen: false,
                      termsOfServiceGen: false,
                    },
                  },
                },
              })
              onChange()
            }
          }
          localLocaleState = { ...localeState, ...change }
          localeSelection = {
            selectedLocales: change.selectedLocales,
            visibleLocales: change.visibleLocales,
          }
        }}
      />
    {/snippet}
    {#if toolbarHeader}
      {@render toolbarHeader(localeToolbar)}
    {:else}
      <SectionHeader
        title="Descriptions"
        description="Names and descriptions in each language"
        icon={DescriptionsIcon}
        class="grid-cols-1! gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]! [&_.bits-form\_\_section-header-right]:[container-type:normal]! [&_.bits-form\_\_section-header-right]:block [&_.bits-form\_\_section-header-right]:min-w-0"
      >
        {#snippet right()}
          {@render localeToolbar()}
        {/snippet}
      </SectionHeader>
    {/if}
  </div>
  <FeatureProfileEditor
    {hubReview}
    {stackNames}
    {stickyFieldHeaders}
    {showPrimaryLocaleHeader}
    {localeHeaderPlacement}
    showToolbar={false}
    localeState={displayLocaleState}
    onLocaleStateChange={state => {
      localLocaleState = state
      localeSelection = {
        selectedLocales: state.selectedLocales,
        visibleLocales: state.visibleLocales,
      }
      expanded = state.expanded
    }}
    {values}
    {recordKey}
    contextKey={`${recordKey}:${resetVersion}:${isEditing}`}
    {isEditing}
    fieldConfigs={configs}
    {translate}
    onTranslated={applyTranslation}
    onAutomatic={stageAutomatic}
    {onReveal}
    {afterField}
  >
    {#snippet children(field, locale, onEditStart, prefix, toolbarActions)}
      {@const key = contentFormKey(locale)}
      {@const config = configs.find(config => config.key === field)!}
      {@const language = getContentLocaleRecord(locale, getLocaleKey())}
      <FormI18nDescriptorFields
        {form}
        fields={fields[key]}
        locale={key}
        {isEditing}
        inline
        {renderValue}
        {onEditStart}
        {toolbarActions}
        fieldConfigs={[
          { ...config, label: prefix, ariaLabel: `${config.label} · ${language.name}` },
        ]}
        {isRequiredInPreflight}
      />
    {/snippet}
  </FeatureProfileEditor>
  {@render children?.(displayLocaleState)}
</div>
