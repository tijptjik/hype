<script lang="ts">
// I18N
import { getI18n, getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// SERVICES
import { sortProperties } from '$lib/client/services/property';
// COMPONENTS
import CategorySection from '$lib/components/panels/filters/CategorySection.svelte';
import CategoryFilter from '$lib/components/panels/filters/CategoryFilter.svelte';
import RangeFilter from '$lib/components/panels/filters/RangeFilter.svelte';
import SelectedFilters from '$lib/components/panels/filters/SelectedFilters.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type {
  Id,
  Organisation,
  Property,
  Project,
  Layer,
  PropertyValue
} from '$lib/types'; // Ensure Property type is imported

// Initialize map state
const appCtx = getAppCtx();

let organisations = $derived(appCtx.state.resources.organisation);
let projects = $derived(appCtx.state.resources.project);
let layers = $derived(appCtx.state.resources.layer);
let activeLayerIds = $derived(new Set(appCtx.state.prisms.layer));

// Helper function to find layer and project details
function getLayerDetails(
  layerId: string
): { layer: Layer; project: Project; organisation: Organisation } | null {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return null;
  const project = projects.find((p) => p.id === layer.projectId);
  if (!project) return null;
  const organisation = organisations.find((o) => o.id === project.organisationId);
  if (!organisation) return null;
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
        layer.properties
          ?.filter((lp) => lp.property && lp.property.type === 'classifier') // Only classifier types for filtering here
          .filter((lp) => lp.isVisible !== false) // Check visibility on the layer property
          .map((lp) => lp.property!) // Extract the nested property
          .filter(
            (prop, index, self) => index === self.findIndex((p) => p.key === prop.key) // Ensure uniqueness by key
          ) || [];

      // Sort properties by type (classifiers first) then rank
      const sortedProperties = sortProperties(
        properties.map((p) => ({ property: p }))
      ).map((item) => item.property!);

      // Construct hierarchy info
      const hierarchy = {
        organisation: appCtx.getContextualOrganisationName(organisation),
        project: appCtx.getContextualProjectName(project),
        layer: appCtx.getContextualLayerName(layer),
        layerId: layer.id // Pass layerId for direct filter access
      };

      return {
        hierarchy,
        properties: sortedProperties
      };
    })
    .filter(
      (group): group is NonNullable<typeof group> =>
        group !== null && group.properties.length > 0
    ) // Filter out nulls and empty groups
);
</script>

{#snippet SelectedCategories(layerId: Id, properties: Property[])}
  <SelectedFilters {layerId} {appCtx} {properties} />
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
            label={getI18n(property, 'label', appCtx.getUserPreferences()) ||
              property.key}
            min={property.min!}
            max={property.max!}
            defaultOpen={property.key === 'grade'} />
        {:else}
          <!-- Pass necessary props directly -->
          <CategoryFilter
            key={property.key}
            layerId={hierarchy.layerId}
            label={getI18n(property, 'label', appCtx.getUserPreferences()) ||
              property.key}
            values={(property.values as PropertyValue[])?.map(
              (v) => v.i18n?.[getLocale()]?.value
            ) || []}
            defaultOpen={property.key === 'grade'} />
        {/if}
      {/each}
    </div>
  </CategorySection>
{/each}
<div class="flex-grow-1 h-[84px] w-full flex-shrink-0"></div>
