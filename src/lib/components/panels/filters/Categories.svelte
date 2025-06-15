<script lang="ts">
// I18N
import { getI18n, getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// SERVICES
import { getGroupedClassifierProperties } from '$lib/client/services/property';
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
  Property,
  PropertyValue
} from '$lib/types'; // Ensure Property type is imported

// Initialize map state
const appCtx = getAppCtx();

let layerCategories = $derived(await getGroupedClassifierProperties(appCtx));
</script>

{#snippet SelectedCategories(layerId: Id, properties: Property[])}
  <SelectedFilters {layerId} {appCtx} {properties} />
{/snippet}

<!-- LAYOUT -->

{#each layerCategories as { hierarchy, properties }, index (hierarchy.layerId)}
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
