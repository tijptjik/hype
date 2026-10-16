<script lang="ts">
import { mapStyleResultStyles } from './formMapStyleSection.styles.js'
import { formSelectionSearchHeaderStyles } from '../formSurface/formSearchHeader.styles.js'
import { LocalSearch, SectionHeader } from '#lib/bits/custom/index.js'
import { m } from '#lib/i18n.js'
import { MapStyleCard } from '#lib/bits/patterns/cards/mapStyleCard/index.js'
import { REGISTERED_MAP_STYLE_CATALOG } from '#lib/map/styles/catalog.js'
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
  <SectionHeader {title} description={subtitle} class={formSelectionSearchHeaderStyles}>
    {#snippet right()}
      {#if isAdding && showModeUi}
        <div class="w-[clamp(7rem,16vw,12rem)] min-w-0">
          <LocalSearch
            options={sortedMapStyles}
            placeholder={m.forms__search_placeholder()}
            focusOnMount={true}
            mountTransitionDuration={showModeUi ? 80 : 0}
            maxResults={20}
            onSelect={handleSelect}
            class="[&_.bits-search-result-item]:min-h-40!"
            resultListClass="grid! grid-cols-2 gap-1!"
            visualResultItemClass={mapStyleResultStyles}
            visualPreviewClass="h-40! w-full! basis-full! min-w-0! border-0! [&_img]:h-full! [&_img]:object-cover [&_img]:object-center"
            resultMap={{
              image: () => null,
              title: (mapStyle: MapStyleSelectionItem) =>
                mapStyle.i18n?.en?.name || mapStyle.code,
              descriminator: (mapStyle: MapStyleSelectionItem) => mapStyle.code,
              previewImage: (mapStyle: MapStyleSelectionItem) =>
                mapStyle.previewImagePath || null,
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
        image={selectedMapStyle?.previewImagePath || null}
        class="shrink-0"
        alt={selectedMapStyle?.i18n?.en?.name ||
          selectedMapStyle?.code ||
          `No ${title}`}
      />
      <MapStyleCard.Body
        code={selectedMapStyle?.code}
        name={selectedMapStyle?.i18n?.en?.name ||
          selectedMapStyle?.code ||
          `No ${title}`}
        description={selectedMapStyle?.i18n?.en?.description || null}
      />
    </MapStyleCard.Root>
  </div>

  <div class="hidden" aria-hidden="true">
    {#each hiddenMapStyleInputAttrs ?? [] as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>
