<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import MapIcon from 'virtual:icons/proicons/map'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import DivisionClassMenu from './DivisionClassMenu.svelte'
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
import FilterBar from '#lib/bits/patterns/panels/components/common/FilterBar.svelte'
import FilteredNeighbourhood from '#lib/bits/patterns/panels/components/items/FilteredNeighbourhood.svelte'
import ResourceContainer from '#lib/bits/patterns/panels/components/common/ResourceContainer.svelte'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'

let {
  model,
  ...panelProps
}: PanelProps & { model: ReturnType<typeof useFilterPanelModel> } = $props()
</script>

{#snippet headerActions()}
  <DivisionClassMenu
    options={model.divisionClasses}
    onToggle={model.toggleDivisionClass}
  />
{/snippet}

{#snippet selectedNeighbourhoods()}
  {#if model.selectedNeighbourhoods.length > 0}
    <div class="flex flex-wrap gap-2 px-6 py-4">
      {#each model.selectedNeighbourhoods as neighbourhood (neighbourhood.id)}
        <button
          type="button"
          class="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary"
          onclick={() => model.toggleDivision(neighbourhood.id)}
        >
          {neighbourhood.name}
          ×
        </button>
      {/each}
    </div>
  {/if}
{/snippet}

<Section
  title={m.filters__divisions()}
  icon={MapIcon}
  {headerActions}
  persistentContent={selectedNeighbourhoods}
  {...panelProps}
>
  {#if model.visibleNeighbourhoodCount > 4}
    <FilterBar
      bind:searchTerm={() => model.searchTerm, model.setSearchTerm}
      position="right"
      onReset={model.resetDivisions}
    />
  {/if}
  <ResourceContainer>
    {#each model.neighbourhoods as row (row.id)}
      <div animate:flip={{ duration: prefersReducedMotion.current ? 0 : 250 }}>
        <FilteredNeighbourhood
          {row}
          loading={model.divisionCountsLoading}
          onToggle={model.toggleDivision}
          onPreview={model.previewDivision}
        />
      </div>
    {/each}
  </ResourceContainer>
</Section>
