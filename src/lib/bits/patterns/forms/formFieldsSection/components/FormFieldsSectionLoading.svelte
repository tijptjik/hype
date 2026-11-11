<script lang="ts">
// COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import FormFieldCard from './FormFieldCard.svelte'
// TYPES
import type { Property } from '#lib/db/zod/schema/property.types.js'
import type {
  FormFieldCardCallbacks,
  FormFieldsSectionLoadingItem,
} from '../formFieldsSection.types.js'
let {
  items = [],
  locales = ['en'],
  multilingual = false,
  visibleLocales,
}: {
  items?: FormFieldsSectionLoadingItem[]
  locales?: string[]
  multilingual?: boolean
  visibleLocales?: string[]
} = $props()
const fallbackLoadingItems: FormFieldsSectionLoadingItem[] = Array.from(
  { length: 3 },
  (_, index) => ({
    id: `loading-field-${index}`,
    presentation: 'full',
    isCollapsed: false,
  }),
)
const loadingItems = $derived(items.length > 0 ? items : fallbackLoadingItems)
const placeholder: Property = {
  id: 'loading-field',
  organisationId: null,
  hubId: null,
  projectId: null,
  scope: 'hub',
  type: 'specifier',
  key: 'field',
  component: 'InputField',
  min: null,
  max: null,
  isTranslatable: false,
  isUserContributable: false,
  isDefaultEnabled: true,
  createdAt: '',
  modifiedAt: '',
  values: [],
  i18n: {
    en: {
      propertyId: 'loading-field',
      locale: 'en',
      label: 'Field name',
      labelGen: false,
      placeholder: 'Field value',
      placeholderGen: false,
    },
  },
}
const callbacks: FormFieldCardCallbacks = {
  onIncreaseRank: () => {},
  onDecreaseRank: () => {},
  onRemove: () => {},
  onUpdateBase: () => {},
  onUpdateI18n: () => {},
  onAddValue: () => {},
  onSortValuesAlphabetically: () => {},
  onRemoveValue: () => {},
  onMoveValue: () => {},
  onUpdateValue: () => {},
  onUpdateValueI18n: () => {},
  onTranslateLocale: async () => {},
  onResetLocale: () => {},
}
</script>
<!-- Reuse field-owned columns, previews and controls; retained fields preserve their exact shape. -->
<ContentSkeleton class="[&_input]:placeholder:text-transparent!">
  <div class="flex w-full flex-col" aria-hidden="true">
    {#each loadingItems as item, index (item.id)}
      <div class="relative py-1.5" data-property-drop-zone={item.id}>
        <FormFieldCard
          property={item.property ?? { ...placeholder, id: item.id }}
          propertyIndex={index}
          sectionRank={index}
          totalItems={loadingItems.length}
          presentation={item.presentation}
          collapsedAll={item.isCollapsed}
          removeMode={false}
          {locales}
          {multilingual}
          {visibleLocales}
          isEditing={false}
          classifierComponents={['SelectField']}
          specifierComponents={['InputField']}
          isRequiredInPreflight={() => false}
          {...callbacks}
        />
      </div>
    {/each}
  </div>
</ContentSkeleton>
