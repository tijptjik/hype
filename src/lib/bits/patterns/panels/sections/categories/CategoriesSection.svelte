<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import CategorySection from '#lib/bits/patterns/panels/sections/categorySection/CategorySection.svelte'
import CategoryFilter from '#lib/bits/patterns/panels/components/controls/CategoryFilter.svelte'
import RangeFilter from '#lib/bits/patterns/panels/components/controls/RangeFilter.svelte'
// ADAPTERS
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
let { model }: { model: ReturnType<typeof useFilterPanelModel> } = $props()
</script>

{#each model.categories as group, index (group.hierarchy.layerId)}
  <CategorySection
    title={m.filters__categories()}
    icon="/flowchart.svg"
    iconVerticalPaddingClass="pt-2"
    iconColorClass="text-blue-500"
    isOpen={index === 0}
    selectedSummary={group.selectedSummary}
    hasActiveFilters={model.hasActiveFilters}
    hierarchy={group.hierarchy}
  >
    <div class="space-y-2">
      {#each group.properties as property (property.id)}
        {@const filter = model.propertyFilter(property, group.hierarchy.layerId)}
        {#if property.component === 'RangeField'}
          <RangeFilter {filter} defaultOpen={property.key === 'grade'} />
        {:else}
          <CategoryFilter {property} {filter} />
        {/if}
      {/each}
    </div>
  </CategorySection>
{/each}
<div class="grow h-21 w-full shrink-0"></div>
