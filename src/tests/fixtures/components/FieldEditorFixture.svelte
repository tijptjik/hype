<script lang="ts">
import type { LocaleSelection } from '#lib/bits/custom/localeControls/localeControls.types.js'
// SVELTE
import { untrack } from 'svelte'
const hubReview =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('hub')
// Exercise explicit Hub mode even when tabs have no inherited route context.
// SVELTEKIT
// @ts-expect-error Exercise the installed remote-form registration contract.
import * as kitForms from '../../../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
import FormFieldsSection from '#lib/bits/patterns/forms/formFieldsSection/FormFieldsSection.svelte'
// CONTENT LOCALES
import { contentFormKey, contentStorageTag } from '#lib/i18n/contentRecords.js'
// SERVICES
import {
  translateProjectPropertyLocale,
  updateProjectPropertyBase,
  updateProjectPropertyI18n,
  addProjectPropertyValue,
  sortProjectPropertyValuesAlphabetically,
  removeProjectPropertyValue,
  reorderProjectPropertyValue,
  updateProjectPropertyValue,
  updateProjectPropertyValueI18n,
  changeProjectPropertyRankUnified,
} from '#lib/client/services/property.js'
// TYPES
import type {
  Property,
  PropertyFormData,
  PropertyTranslationOrigin,
} from '#lib/db/zod/schema/property.types.js'
import type {
  FormDataUpdaterForm,
  FormIssueLike,
} from '#lib/client/services/form.types.js'

setResponsiveCtx()
let {
  translatable = true,
  fieldCount = 1,
  panelPadding = false,
  extraLocales = [],
  multilingual = $bindable(false),
  localeSelection = $bindable<LocaleSelection | null>(null),
  translate,
  allIssues = [],
}: {
  translatable?: boolean
  fieldCount?: number
  panelPadding?: boolean
  extraLocales?: string[]
  allIssues?: FormIssueLike[]
  multilingual?: boolean
  localeSelection?: LocaleSelection | null
  translate?: (
    propertyId: string,
    source: string,
    target: string,
    origin?: PropertyTranslationOrigin,
  ) => Promise<boolean | void>
} = $props()
let loading = $state(false)
let data = $state<PropertyFormData>({
  properties: [
    {
      id: 'religion',
      scope: 'hub',
      hubId: 'core',
      key: 'religion',
      type: 'classifier',
      component: 'SelectField',
      rank: 0,
      isTranslatable: untrack(() => translatable),
      audience: 'public',
      isDefaultEnabled: true,
      i18n: {
        ...Object.fromEntries(
          untrack(() => extraLocales).map(locale => [
            contentFormKey(locale),
            {
              locale: contentStorageTag(locale),
              label: `Religion ${locale}`,
              labelGen: true,
              placeholder: `Select ${locale}`,
              placeholderGen: false,
            },
          ]),
        ),
        en: {
          locale: 'en',
          label: 'Religion',
          labelGen: false,
          placeholder: 'Select religion',
          placeholderGen: false,
        },
        zhHant: {
          locale: 'zh-hant',
          label: '宗教',
          labelGen: true,
          placeholder: '選擇宗教',
          placeholderGen: true,
        },
        zhHans: {
          locale: 'zh-hans',
          label: '宗教',
          labelGen: true,
          placeholder: '选择宗教',
          placeholderGen: true,
        },
      },
      values: [
        'Christian',
        'Catholic',
        'Buddhist',
        'Taoist',
        'Muslim',
        'Hindu',
        'Other',
      ].map((value, rank) => ({
        id: `option-${rank}`,
        propertyId: 'religion',
        rank,
        value,
        i18n: {
          ...Object.fromEntries(
            untrack(() => extraLocales).map(locale => [
              contentFormKey(locale),
              {
                locale: contentStorageTag(locale),
                value: `${value} ${locale}`,
                valueGen: true,
              },
            ]),
          ),
          en: { locale: 'en', value, valueGen: false },
          zhHant: {
            locale: 'zh-hant',
            value: ['基督教', '天主教', '佛教', '道教', '伊斯蘭教', '印度教', '其他'][
              rank
            ],
            valueGen: true,
          },
          zhHans: { locale: 'zh-hans', value: '', valueGen: false },
        },
      })),
    } as unknown as Property,
  ],
})
// Exercise section controls against independent field identities when requested.
const properties = untrack(() => data.properties)
if (!properties?.[0]) throw new Error('Missing fixture property')
for (let index = 1; index < untrack(() => fieldCount); index++) {
  const property = structuredClone($state.snapshot(properties[0]))
  property.id = `field-${index}`
  property.rank = index
  property.values = property.values?.map((value, rank) => ({
    ...value,
    id: `field-${index}-option-${rank}`,
    propertyId: property.id,
  }))
  properties.push(property)
}
const fields = kitForms.create_field_proxy({
  form_id: 'field-editor',
  get: () => ({ data }),
  set: (path: (string | number)[], value: unknown) => {
    if (!path.length) data = (value as { data: PropertyFormData }).data
    else kitForms.deep_set({ data }, path, value)
  },
  get_issues: () => ({}),
  get_touched: () => ({}),
  get_dirty: () => ({}),
})
const form = { fields } as FormDataUpdaterForm<PropertyFormData>
let editing = $state(true)
</script>

<main
  class="bits-theme bg-background text-foreground min-w-0 {panelPadding
    ? 'flex min-h-0 flex-1 flex-col'
    : 'min-h-screen'}"
>
  <div class="border-border flex gap-4 border-b p-4">
    <h1 class="text-lg font-semibold">Fields</h1>
    <button type="button" onclick={() => (loading = !loading)}>Toggle loading</button>
    <button type="button" onclick={() => (editing = !editing)}>Toggle editing</button>
  </div>
  <form data-field-form class={panelPadding ? 'flex min-h-0 flex-1 flex-col' : ''}>
    {#if hubReview}
      <button
        type="submit"
        data-header-save
        class="bg-panel fixed top-3 right-4 z-50 rounded border p-3"
      >
        Save record
      </button>
    {/if}
    {#snippet fieldsSection()}
      <FormFieldsSection
        {hubReview}
        isLoading={loading}
        bind:localeSelection
        bind:multilingual
        class={panelPadding ? 'shrink-0' : ''}
        title="Fields"
        description="Categorical and free form fields"
        items={[...(data.properties ?? [])].sort(
          (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
        )}
        isEditing={editing}
        actions={{
          add: () => {},
          remove: () => {},
          increaseRank: (_event, id) =>
            changeProjectPropertyRankUnified(form, id, 'up'),
          decreaseRank: (_event, id) =>
            changeProjectPropertyRankUnified(form, id, 'down'),
        }}
        card={{
          allIssues,
          removeMode: false,
          locales: ['en', 'zhHant', 'zhHans'],
          classifierComponents: ['SelectField'],
          specifierComponents: [
            'InputField',
            'PhoneField',
            'RangeField',
            'DateRangeField',
            'TimeRangeField',
            'LinkField',
          ],
          isRequiredInPreflight: () => false,
          isEditing: editing,
          getPropertyIndex: id =>
            (data.properties ?? []).findIndex(property => property.id === id),
          getPropertyFields: (_id, index) => fields.data.properties[index],
          onIncreaseRank: (_event, id) =>
            changeProjectPropertyRankUnified(form, id, 'up'),
          onDecreaseRank: (_event, id) =>
            changeProjectPropertyRankUnified(form, id, 'down'),
          onRemove: () => {},
          onUpdateBase: (...args) => updateProjectPropertyBase(form, ...args),
          onUpdateI18n: (...args) => updateProjectPropertyI18n(form, ...args),
          onAddValue: id => addProjectPropertyValue(form, id),
          onSortValuesAlphabetically: (...args) =>
            sortProjectPropertyValuesAlphabetically(form, ...args),
          onRemoveValue: (...args) => removeProjectPropertyValue(form, ...args),
          onMoveValue: (...args) => reorderProjectPropertyValue(form, ...args),
          onUpdateValue: (...args) => updateProjectPropertyValue(form, ...args),
          onUpdateValueI18n: (...args) => updateProjectPropertyValueI18n(form, ...args),
          onTranslateLocale: (propertyId, source, target, origin) =>
            translate
              ? translate(propertyId, source, target, origin)
              : translateProjectPropertyLocale(
                  form,
                  propertyId,
                  source,
                  target,
                  origin,
                ),
          onResetLocale: () => {},
        }}
      />
    {/snippet}
    {#if panelPadding}
      <FormSurface class={`${resourceTabsStyles} flex min-h-0 flex-1 flex-col`}>
        {@render fieldsSection()}
      </FormSurface>
    {:else}
      {@render fieldsSection()}
    {/if}
  </form>
  <output hidden data-property-state={JSON.stringify(data)}></output>
</main>
