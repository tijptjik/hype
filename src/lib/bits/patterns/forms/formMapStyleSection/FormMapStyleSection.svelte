<script lang="ts">
import { LocalSearch, SectionHeader } from '$lib/bits/custom'
import { m } from '$lib/i18n'
import { MapStyleCard } from '$lib/bits/patterns/cards/mapStyleCard'
import { REGISTERED_MAP_STYLE_CATALOG } from '$lib/map/styles/catalog'
import { getMapStyleCatalogI18n } from '$lib/map/styles/i18n'
import * as FormMapStyleSectionPrimitive from './components'

import type {
  FormMapStyleSectionProps,
  MapStyleSelectionItem,
} from './formMapStyleSection.types'

let {
  title,
  subtitle,
  availableMapStyles,
  selectedMapStyle = null,
  hiddenMapStyleInputAttrs = [],
  isEditing = true,
  isSubmitting = false,
  isSubmitRequested = false,
  startInAddingMode = false,
  onSelectMapStyle,
  class: className = '',
}: FormMapStyleSectionProps = $props()

let isAdding = $state(false)
let wasSubmitRequested = $state(false)
let hasAutoOpenedAdding = $state(false)

const fallbackMapStyles = $derived(
  REGISTERED_MAP_STYLE_CATALOG.map(
    (entry): MapStyleSelectionItem => ({
      id: entry.key,
      code: entry.key,
      previewImagePath: null,
      i18n: getMapStyleCatalogI18n(entry.key),
    }),
  ),
)

const resolvedMapStyles = $derived(
  availableMapStyles.length > 0 ? availableMapStyles : fallbackMapStyles,
)

const sortedMapStyles = $derived(
  [...resolvedMapStyles].sort((a, b) =>
    (a.i18n?.en?.name ?? a.code).localeCompare(b.i18n?.en?.name ?? b.code),
  ),
)
const showModeUi = $derived(isEditing && !isSubmitting)

function toggleAdding(): void {
  isAdding = !isAdding
}

function handleSelect(mapStyle: MapStyleSelectionItem): void {
  onSelectMapStyle(mapStyle)
  isAdding = false
}

$effect(() => {
  if (!isAdding) return
  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') isAdding = false
  }
  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
})

$effect(() => {
  if (showModeUi) return
  isAdding = false
})

$effect(() => {
  if (isSubmitRequested && !wasSubmitRequested) {
    isAdding = false
  }
  wasSubmitRequested = isSubmitRequested
})

$effect(() => {
  if (hasAutoOpenedAdding) return
  if (!startInAddingMode) return
  if (!showModeUi) return
  if (selectedMapStyle) return
  isAdding = true
  hasAutoOpenedAdding = true
})
</script>

<section
  class={`bits-form__section bits-form__parent-resource bits-map-style-section ${isAdding && showModeUi ? 'bits-form__parent-resource--search-open' : ''} ${className}`}
>
  <SectionHeader {title} description={subtitle}>
    {#snippet right()}
      <FormMapStyleSectionPrimitive.Actions
        {isAdding}
        {isEditing}
        {isSubmitting}
        onToggleAdding={toggleAdding}
      />
    {/snippet}
  </SectionHeader>

  {#if isAdding && showModeUi}
    <div class="bits-form__parent-resource-search bits-map-style-section__search">
      <LocalSearch
        options={sortedMapStyles}
        placeholder={m.forms__search_placeholder()}
        focusOnMount={true}
        mountTransitionDuration={showModeUi ? 80 : 0}
        maxResults={20}
        onSelect={handleSelect}
        class="bits-search--compact-results"
        visualResultItemClass="min-h-[7.5rem] items-stretch [&_.bits-search-result-item__content--visual]:min-h-[7.5rem] [&_.bits-search-result-item__copy]:gap-1.5 [&_.bits-search-result-item__copy]:px-4 [&_.bits-search-result-item__copy]:py-4 [&_.bits-search-result-item__title]:text-lg [&_.bits-search-result-item__discriminator]:text-base [&_.bits-search-result-item__discriminator]:font-mono"
        visualPreviewClass="flex h-auto w-44 basis-44 min-w-44 items-center self-stretch [&_.bits-search-result-item__preview-image]:object-center"
        resultMap={{
          image: () => null,
          title: (mapStyle: MapStyleSelectionItem) => mapStyle.i18n?.en?.name || mapStyle.code,
          descriminator: (mapStyle: MapStyleSelectionItem) => mapStyle.code,
          previewImage: (mapStyle: MapStyleSelectionItem) => mapStyle.previewImagePath || null,
          variant: () => 'visual',
        }}
      />
    </div>
  {/if}

  {#if selectedMapStyle}
    <div class="bits-form__parent-resource-list bits-map-style-section__list">
      <MapStyleCard.Root>
        <MapStyleCard.Preview
          image={selectedMapStyle.previewImagePath || null}
          styleCode={selectedMapStyle.code}
          alt={selectedMapStyle.i18n?.en?.name || selectedMapStyle.code}
        />
        <MapStyleCard.Body
          code={selectedMapStyle.code}
          name={selectedMapStyle.i18n?.en?.name || selectedMapStyle.code}
          description={selectedMapStyle.i18n?.en?.description || null}
        />
      </MapStyleCard.Root>
    </div>
  {/if}

  <div class="hidden" aria-hidden="true">
    {#each hiddenMapStyleInputAttrs ?? [] as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>
