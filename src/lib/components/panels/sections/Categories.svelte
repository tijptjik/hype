<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// SERVICES
import { getGroupedClassifierProperties } from '$lib/client/services/property';
// COMPONENTS
import CategorySection from '$lib/components/panels/sections/CategorySection.svelte';
import CategoryFilter from '$lib/components/panels/controls/CategoryFilter.svelte';
import RangeFilter from '$lib/components/panels/controls/RangeFilter.svelte';
import SelectedFilters from '$lib/components/panels/elements/SelectedFilters.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Id, Property } from '$lib/types';

// Initialize map state
const appCtx = getAppCtx();

// @ts-expect-error SVELTE ASYNC
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
        {@const layerId = hierarchy.layerId}
        {#if property.component === 'RangeField'}
          <RangeFilter {property} {layerId} defaultOpen={property.key === 'grade'} />
        {:else}
          <CategoryFilter {property} {layerId} />
        {/if}
      {/each}
    </div>
  </CategorySection>
{/each}
<div class="flex-grow-1 h-[84px] w-full flex-shrink-0"></div>
