<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// SERVICES
import { getGroupedClassifierProperties } from '$lib/client/services/property'
// COMPONENTS
import CategorySection from '$lib/components/panels/sections/CategorySection.svelte'
import CategoryFilter from '$lib/components/panels/controls/CategoryFilter.svelte'
import RangeFilter from '$lib/components/panels/controls/RangeFilter.svelte'
import SelectedFilters from '$lib/components/panels/elements/SelectedFilters.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// TYPES
import type { Id, PanelProps } from '$lib/types'
import type { Property } from '$lib/db/zod/schema/property.types'

// CONTEXT
const appCtx = getAppCtx()

// PROPS
let { ...panelProps }: PanelProps = $props()
</script>

{#snippet SelectedCategories(layerId: Id, properties: Property[])}
  <SelectedFilters {layerId} {appCtx} {properties} />
{/snippet}

<!-- LAYOUT -->

{#await getGroupedClassifierProperties(appCtx) then newLayerCategories}
  {#each newLayerCategories as { hierarchy, properties }, index (hierarchy.layerId)}
    <CategorySection
      title={m.filters__categories()}
      icon="/flowchart.svg"
      iconVerticalPaddingClass="pt-2"
      iconColorClass="text-blue-500"
      isOpen={index === 0}
      collapsedContent={SelectedCategories}
      {properties}
      {hierarchy}
    >
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
{/await}
<div class="flex-grow-1 h-[84px] w-full flex-shrink-0"></div>
