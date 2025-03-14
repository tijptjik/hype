<script lang="ts">
// I18N
import * as m from '$lib/paraglide/messages.js';
import { getI18nValue } from '$lib/i18n';
import { languageTag } from '$lib/paraglide/runtime';
// COMPONENTS
import CategorySection from '$lib/components/panels/filters/CategorySection.svelte';
import CategoryFilter from '$lib/components/panels/filters/CategoryFilter.svelte';
import RangeFilter from '$lib/components/panels/filters/RangeFilter.svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

// Initialize map state
const mapContext = getMapContext();

let projects = $derived(mapContext.state.resources.projects);
let organisations = $derived(mapContext.state.resources.organisations);
let layers = $derived(mapContext.state.resources.layers);

// Group properties by layer and include hierarchy info
let layerCategories = $derived(
  layers
    .filter((l) => mapContext.state.prisms.layers.includes(l.id))
    .map((layer) => {
      const project = projects.find((p) => p.id === layer.projectId);
      const organisation = organisations.find((o) => o.id === project?.organisationId);

      // Filter properties based on visibility in layer
      const properties =
        project?.properties
          .filter((p) => p.type === 'classifier')
          // Check if property is visible in layer
          .filter((prop) => {
            const layerProperty = layer.properties?.find(
              (lp) => lp.propertyId === prop.id
            );
            return layerProperty?.isVisible !== false;
          })
          // Remove duplicates based on key
          .filter(
            (prop, index, self) => index === self.findIndex((p) => p.key === prop.key)
          ) || [];

      // Check if this project has only one layer
      const projectLayerCount = layers.filter(
        (l) => l.projectId === project?.id
      ).length;
      const layerName = projectLayerCount === 1 ? null : layer.nameShort || layer.name;

      return {
        hierarchy:
          languageTag() === 'en'
            ? {
                organisation:
                  organisation?.code || organisation?.nameShort || organisation?.name,
                project: project?.code || project?.nameShort || project?.name,
                layer: layerName
              }
            : {
                organisation: getI18nValue(organisation, 'name'),
                project: getI18nValue(project, 'name'),
                layer: getI18nValue(layer, 'name')
              },
        properties
      };
    })
    .filter((group) => group.properties.length > 0)
);

// Track selected values for each category, grouped by layer
let selectedCategories = $derived({
  ...Object.fromEntries(
    layerCategories.flatMap((group) =>
      group.properties.map((p) => [
        p.key,
        p.component === 'RangeField' ? null : []
      ])
    )
  ),
  ...(mapContext.state.filters.properties || {})
});

// Helper function to get translated values
function getTranslatedValues(values: any[]) {
  return values.map((v) => ({
    value: v.value,
    translations: v.translations || []
  }));
}
</script>

<!-- COMPONENTS -->

{#snippet SelectedCategories()}
  <div></div>
{/snippet}

<!-- LAYOUT -->

{#each layerCategories as { hierarchy, properties }, index}
  <CategorySection
    title={m.filters__categories()}
    icon="/flowchart.svg"
    iconVerticalPaddingClass="pt-2"
    iconColorClass="text-blue-500"
    isOpen={index === 0}
    {hierarchy}>
    <div class="space-y-2">
      {#each properties as property}
        {#if property.component === 'RangeField'}
          <RangeFilter {property} {selectedCategories} />
        {:else}
          <CategoryFilter
            key={property.key}
            label={getI18nValue(property, 'label')}
            values={getTranslatedValues(property.values)}
            selected={selectedCategories[property.key]} />
        {/if}
      {/each}
    </div>
  </CategorySection>
{/each}
