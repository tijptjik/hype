<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// SERVICES
import {
  filterPlaces,
  getFilteredNeighbourhoods,
  getNeighbourhoodsAsResources,
} from '$lib/client/services/geospatial'
// COMPONENTS
import * as Panel from '$lib/bits/patterns/panels'
import Section from '$lib/components/panels/common/Section.svelte'
import FilterBar from '$lib/components/panels/common/FilterBar.svelte'
import FilteredNeighbourhood from '$lib/components/panels/common/variants/FilteredNeighbourhood.svelte'
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// TYPE
import type { NeighbourhoodResource, PanelProps } from '$lib/types'
// CONTEXT
const appCtx = getAppCtx()

// PROPS
let { ...panelProps }: PanelProps = $props()

// STATE
let searchTerm = $state('')

// DERIVED
const allNeighbourhoods: NeighbourhoodResource[] = $derived(
  getNeighbourhoodsAsResources(),
)
const neighbourhoodCounts = $derived(appCtx.placeCtx.neighbourhoodFeatureCounts)
const selectedNeighbourhoodRefs = $derived(appCtx.placeCtx.getFilteredNeighbourhoods())
const filteredNeighbourhoods = $derived(filterPlaces(appCtx, searchTerm))
</script>

<!-- COMPONENTS -->

{#snippet SelectedNeighbourhoods()}
  <Panel.Item.SelectedResource
    resourceType="neighbourhood"
    resources={allNeighbourhoods}
    selectedIds={selectedNeighbourhoodRefs}
    colorClass="text-emerald-600"
    {...panelProps}
  />
{/snippet}

<!-- LAYOUT -->

<Section
  title={m.filters__neighbourhoods()}
  icon="/neighbourhood.svg"
  iconVerticalPaddingClass="pt-2"
  collapsedContent={SelectedNeighbourhoods}
  {...panelProps}
>
  {#if Array.from(neighbourhoodCounts.values()).filter((count) => count > 0).length == 0}
    {@render SelectedNeighbourhoods()}
  {/if}
  {#if Array.from(neighbourhoodCounts.values()).filter((count) => count > 0).length > 4}
    <FilterBar
      bind:searchTerm
      position="right"
      onReset={() => appCtx.placeCtx.resetNeighbourhoods()}
    />
  {/if}
  <ResourceContainer>
    {#each filteredNeighbourhoods as [ neighbourhoodRef, i18n ]}
      <FilteredNeighbourhood {neighbourhoodRef} {i18n} {selectedNeighbourhoodRefs} />
    {/each}
  </ResourceContainer>
</Section>
