<script lang="ts">
import { mapStyleResultStyles } from './formMapStyleSection.styles.js'
import { formSelectionSearchHeaderStyles } from '../formSurface/formSearchHeader.styles.js'
import { LocalSearch, SectionHeader } from '#lib/bits/custom/index.js'
import { m } from '#lib/i18n.js'
import { MapStyleCard } from '#lib/bits/patterns/cards/mapStyleCard/index.js'
import {
  canonicalMapStyleCode,
  isMapStyleSelectable,
  SELECTABLE_MAP_STYLE_CATALOG,
  isProjectOnlyMapStyle,
} from '#lib/map/styles/catalog.js'
import { getMapStyleCatalogI18n } from '#lib/map/styles/i18n.js'
import { getMapStyleRenderAssetPath } from '#lib/map/styles/render.shared.js'
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
  additionalMapStyles = [],
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
  SELECTABLE_MAP_STYLE_CATALOG.filter(entry => !isProjectOnlyMapStyle(entry.key)).map(
    (entry): MapStyleSelectionItem => ({
      id: entry.key,
      code: entry.key,
      // New projects have no organisation scope yet, so resolve previews through
      // the stage-aware asset route instead of falling back to colour swatches.
      previewImagePath: getMapStyleRenderAssetPath(entry.key),
      i18n: getMapStyleCatalogI18n(entry.key),
    }),
  ),
)

const resolvedMapStyles = $derived(
  availableMapStyles.length > 0 ? availableMapStyles : fallbackMapStyles,
)

const userPreferenceStyle = $derived<MapStyleSelectionItem>({
  id: 'user-preference',
  code: '',
  i18n: {
    en: {
      name: m.theme_map_user_preference(),
      description: m.theme_map_user_preference_description(),
    },
  },
})
const displayMapStyle = $derived(selectedMapStyle ?? userPreferenceStyle)

// Inheritance choices stay first; explicit styles follow their canonical code.
const sortedMapStyles = $derived([
  ...additionalMapStyles,
  userPreferenceStyle,
  ...resolvedMapStyles
    .filter(style => isMapStyleSelectable(style.code))
    .toSorted((a, b) =>
      canonicalMapStyleCode(a.code).localeCompare(canonicalMapStyleCode(b.code)),
    ),
])
// Ten narrow windows sample the public dark palettes, repeating if fewer are available.
const darkPreviewStyles = SELECTABLE_MAP_STYLE_CATALOG.filter(
  entry => entry.basemapVariant === 'dark' && !isProjectOnlyMapStyle(entry.key),
)
const userChoiceSlices = Array.from({ length: 10 }, (_, index) =>
  getMapStyleRenderAssetPath(darkPreviewStyles[index % darkPreviewStyles.length].key),
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

{#snippet userChoicePreview()}
  <div class="flex h-full w-full overflow-hidden bg-black" aria-hidden="true">
    {#each userChoiceSlices as image, index (index)}
      <div class="relative h-full min-w-0 flex-1 overflow-hidden">
        <img src={image} alt="" class="h-full w-full object-cover" loading="lazy">
      </div>
    {/each}
  </div>
{/snippet}

<section
  class={`bits-form__section bits-form__parent-resource bits-map-style-section ${isAdding && showModeUi ? 'bits-form__parent-resource--search-open' : ''} ${className}`}
>
  <SectionHeader {title} description={subtitle} class={formSelectionSearchHeaderStyles}>
    {#snippet right()}
      {#if isAdding && showModeUi}
        <div class="w-[clamp(7rem,12vw,10rem)] min-w-0">
          <LocalSearch
            options={sortedMapStyles}
            placeholder={m.forms__search_placeholder()}
            focusOnMount={true}
            mountTransitionDuration={0}
            getItemId={() => ''}
            maxResults={sortedMapStyles.length}
            onSelect={handleSelect}
            class="[&_.bits-search-result-item]:min-h-40!"
            resultListClass="grid! grid-cols-2 gap-1!"
            visualResultItemClass={mapStyleResultStyles}
            visualPreviewClass="h-40! w-full! basis-full! min-w-0! border-0! [&_img]:h-full! [&_img]:object-cover [&_img]:object-center"
            resultMap={{
              image: () => null,
              title: (mapStyle: MapStyleSelectionItem) =>
                mapStyle.i18n?.en?.name || mapStyle.code,
              descriminator: (mapStyle: MapStyleSelectionItem) =>
                canonicalMapStyleCode(
                  mapStyle.displayCode ??
                    (mapStyle.code === '__project-default__' ? '' : mapStyle.code),
                ),
              previewImage: (mapStyle: MapStyleSelectionItem) =>
                mapStyle.previewImagePath || null,
              preview: (mapStyle: MapStyleSelectionItem) =>
                mapStyle.code === '' ? userChoicePreview : undefined,
              variant: () => 'visual',
            }}
          />
        </div>
      {/if}

      <FormMapStyleSectionPrimitive.Actions
        {isAdding}
        {isEditing}
        {isSubmitting}
        onToggleAdding={toggleAdding}
      />
    {/snippet}
  </SectionHeader>

  <!-- Keep the same preview card footprint before and after a style is selected. -->
  <div class="bits-form__parent-resource-list bits-map-style-section__list">
    <MapStyleCard.Root>
      <MapStyleCard.Preview
        children={displayMapStyle.code === '' ? userChoicePreview : undefined}
        image={displayMapStyle?.previewImagePath || null}
        class="shrink-0"
        alt={displayMapStyle?.i18n?.en?.name || displayMapStyle?.code || `No ${title}`}
      />
      <MapStyleCard.Body
        code={canonicalMapStyleCode(
          displayMapStyle.displayCode ?? displayMapStyle.code,
        )}
        name={displayMapStyle?.i18n?.en?.name || displayMapStyle?.code || `No ${title}`}
        description={displayMapStyle?.i18n?.en?.description || null}
      />
    </MapStyleCard.Root>
  </div>

  <div class="hidden" aria-hidden="true">
    {#each hiddenMapStyleInputAttrs ?? [] as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>
