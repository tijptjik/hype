<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import Section from '$lib/bits/patterns/panels/components/common/Section.svelte'
import FilterBar from '$lib/bits/patterns/panels/components/common/FilterBar.svelte'
import FilteredNeighbourhood from '$lib/bits/patterns/panels/components/items/FilteredNeighbourhood.svelte'
import ResourceContainer from '$lib/bits/patterns/panels/components/common/ResourceContainer.svelte'
// TYPES
import type { PanelProps } from '$lib/types'
import type { useFilterPanelModel } from '$lib/adapters/panels/useFilterPanelModel.svelte'

let {
  model,
  ...panelProps
}: PanelProps & { model: ReturnType<typeof useFilterPanelModel> } = $props()
</script>

{#snippet selectedNeighbourhoods()}
  <div class="flex flex-wrap gap-2 px-4 pb-3">
    {#each model.selectedNeighbourhoods as neighbourhood (neighbourhood.id)}
      <button
        type="button"
        class="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary"
        onclick={() => model.toggleNeighbourhood(neighbourhood.id)}
      >
        {neighbourhood.name}
        ×
      </button>
    {/each}
  </div>
{/snippet}

<Section
  title={m.filters__neighbourhoods()}
  icon="/neighbourhood.svg"
  iconGraphicClass="scale-125 origin-bottom-right"
  iconVerticalPaddingClass="pt-0"
  collapsedContent={selectedNeighbourhoods}
  {...panelProps}
>
  {#if model.visibleNeighbourhoodCount === 0}
    {@render selectedNeighbourhoods()}
  {/if}
  {#if model.visibleNeighbourhoodCount > 4}
    <FilterBar
      bind:searchTerm={() => model.searchTerm, model.setSearchTerm}
      position="right"
      onReset={model.resetNeighbourhoods}
    />
  {/if}
  <ResourceContainer>
    {#each model.neighbourhoods as row (row.id)}
      <FilteredNeighbourhood {row} onToggle={model.toggleNeighbourhood} />
    {/each}
  </ResourceContainer>
</Section>
