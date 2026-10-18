<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import GridIcon from 'virtual:icons/proicons/grid'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import CategorySection from '#lib/bits/patterns/panels/sections/categorySection/CategorySection.svelte'
import CategoryFilter from '#lib/bits/patterns/panels/components/controls/CategoryFilter.svelte'
import RangeFilter from '#lib/bits/patterns/panels/components/controls/RangeFilter.svelte'
// ADAPTERS
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
let {
  model,
  ...panelProps
}: PanelProps & {
  model: ReturnType<typeof useFilterPanelModel>
} = $props()
</script>

{#each model.categories as group, index (group.hierarchy.layerId)}
  <!-- Animate the whole keyed layer group as its selection enters or leaves. -->
  <div
    class="shrink-0"
    transition:slide={{
      axis: 'y',
      duration: prefersReducedMotion.current ? 0 : 240,
      easing: cubicOut,
    }}
  >
    <CategorySection
      {panelProps}
      title={m.filters__categories()}
      icon={GridIcon}
      isOpen={index === 0}
      selectedSummary={group.selectedSummary}
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
  </div>
{/each}
