<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import MapIcon from 'virtual:icons/proicons/map'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import SelectionChip from '#lib/bits/patterns/panels/components/common/SelectionChip.svelte'
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
        <SelectionChip
          label={neighbourhood.name}
          onRemove={() => model.toggleDivision(neighbourhood.id)}
        />
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
  {#if model.divisionsLoading}
    <div aria-busy="true" aria-label={m.resource_loading()} role="status">
      <div
        class="border-border bg-surface mx-3 mb-2 flex h-[42px] items-center gap-2 rounded-xl border px-3"
        aria-hidden="true"
      >
        <span
          class="bg-base-content/10 size-4 rounded motion-safe:animate-pulse"
        ></span>
        <span
          class="bg-base-content/10 h-3 w-28 rounded motion-safe:animate-pulse"
        ></span>
      </div>
      <div class="py-1" aria-hidden="true">
        {#each [24, 32, 28, 36, 32, 28, 36] as width}
          <div class="flex h-[56px] items-center gap-3 pr-7 pl-8">
            <span
              class="bg-base-content/10 size-5 shrink-0 rounded motion-safe:animate-pulse"
            ></span>
            <span class="flex flex-1 flex-col gap-1.5">
              <span
                class="bg-base-content/10 h-3 w-12 rounded motion-safe:animate-pulse"
              ></span>
              <span
                class="bg-base-content/10 h-4 rounded motion-safe:animate-pulse"
                style:width="{width * 4}px"
              ></span>
            </span>
            <span
              class="bg-base-content/10 size-8 shrink-0 rounded motion-safe:animate-pulse"
            ></span>
          </div>
        {/each}
      </div>
    </div>
  {:else if model.visibleNeighbourhoodCount > 4 || model.searchTerm}
    <FilterBar
      bind:searchTerm={() => model.searchTerm, model.setSearchTerm}
      label={m.panel__search({ name: m.filters__divisions() })}
      onReset={model.resetDivisions}
    />
  {/if}
  {#if !model.divisionsLoading}
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
  {/if}
</Section>
