<script lang="ts">
// I18N
import { m, getI18nValue, getLocale } from '$lib/i18n';
// UTILS
import { getTranslatedValues } from '$lib/utils/formatting';
// COMPONENTS
import CategorySection from '$lib/components/panels/filters/CategorySection.svelte';
import CategoryFilter from '$lib/components/panels/filters/CategoryFilter.svelte';
import RangeFilter from '$lib/components/panels/filters/RangeFilter.svelte';
import SelectedFilters from '$lib/components/panels/filters/SelectedFilters.svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// TYPES
import type { Id, Property } from '$lib/types'; // Ensure Property type is imported

// Initialize map state
const mapContext = getMapContext();

let organisations = $derived(mapContext.state.resources.organisation);
let projects = $derived(mapContext.state.resources.project);
let layers = $derived(mapContext.state.resources.layer);
let activeLayerIds = $derived(new Set(mapContext.state.prisms.layer));

// Helper function to find layer and project details
function getLayerDetails(layerId: string) {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return null;
  const project = projects.find((p) => p.id === layer.projectId);
  if (!project) return null;
  const organisation = organisations.find((o) => o.id === project.organisationId);
  return { layer, project, organisation };
}

// Group properties by layer and include hierarchy info
let layerCategories = $derived(
  [...activeLayerIds]
    .map((layerId) => {
      const details = getLayerDetails(layerId);
      if (!details) return null;

      const { layer, project, organisation } = details;

      // Filter properties based on visibility in layer
      const properties: Property[] =
        project.properties
          ?.filter((p) => p.type === 'classifier') // Only classifier types for filtering here
          .filter((prop) => {
            const layerProperty = layer.properties?.find(
              (lp) => lp.propertyId === prop.id
            );
            return layerProperty?.isVisible !== false; // Check visibility
          })
          .filter(
            (prop, index, self) => index === self.findIndex((p) => p.key === prop.key) // Ensure uniqueness by key
          )
          .sort((a, b) => {
            // Sort 'grade' properties first
            if (a.key === 'grade') return -1;
            if (b.key === 'grade') return 1;
            return 0;
          }) || [];

      // Determine layer name display logic
      const projectLayerCount = layers.filter((l) => l.projectId === project.id).length;
      const layerName = projectLayerCount === 1 ? null : layer.nameShort || layer.name;

      // Construct hierarchy info
      const hierarchy =
        getLocale() === 'en'
          ? {
              organisation:
                organisation?.code || organisation?.nameShort || organisation?.name,
              project: project?.code || project?.nameShort || project?.name,
              layer: layerName,
              layerId: layer.id // Pass layerId for direct filter access
            }
          : {
              organisation: getI18nValue(organisation, 'name'),
              project: getI18nValue(project, 'name'),
              layer: getI18nValue(layer, 'name'),
              layerId: layer.id // Pass layerId for direct filter access
            };

      return {
        hierarchy,
        properties
      };
    })
    .filter(
      (group): group is NonNullable<typeof group> =>
        group !== null && group.properties.length > 0
    ) // Filter out nulls and empty groups
);
</script>

{#snippet SelectedCategories(layerId: Id, properties: Property[])}
  <SelectedFilters {layerId} {mapContext} {properties} />
{/snippet}

<!-- LAYOUT -->

{#each layerCategories as { hierarchy, properties }, index}
  <CategorySection
    title={m.filters__categories()}
    icon="/flowchart.svg"
    iconVerticalPaddingClass="pt-2"
    iconColorClass="text-blue-500"
    isOpen={index === 0}
    collapsedContent={SelectedCategories}
    {properties}
    {hierarchy}>
    <div class="space-y-2">
      {#each properties as property (property.id)}
        {#if property.component === 'RangeField'}
          <!-- Pass necessary props directly -->
          <RangeFilter
            key={property.key}
            layerId={hierarchy.layerId}
            label={getI18nValue(property, 'label') || property.key}
            min={property.min!}
            max={property.max!}
            defaultOpen={property.key === 'grade'} />
        {:else}
          <!-- Pass necessary props directly -->
          <CategoryFilter
            key={property.key}
            layerId={hierarchy.layerId}
            label={getI18nValue(property, 'label') || property.key}
            values={getTranslatedValues(property.values)}
            defaultOpen={property.key === 'grade'} />
        {/if}
      {/each}
    </div>
  </CategorySection>
{/each}
<div class="flex-grow-1 h-[84px] w-full flex-shrink-0"></div>
