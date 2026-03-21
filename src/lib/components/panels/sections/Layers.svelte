<script lang="ts">
import { browser } from '$app/environment'
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// ICONS
import Square3Stack3d from 'virtual:icons/lucide/layers-3'
// COMPONENTS
import * as Panel from '$lib/bits/patterns/panels'
import Section from '$lib/components/panels/common/Section.svelte'
import FilterBar from '$lib/components/panels/common/FilterBar.svelte'
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { ResourceContext, Id, PanelProps } from '$lib/types'
import type { Snippet } from 'svelte'

// Initialize query client and map state
const appCtx = getAppCtx()
const MANAGED_LIST_FLIP_DURATION_MS = 150
const resourceType = FirstClassResource.layer

// PROPS
let {
  filteredItem,
  ...panelProps
}: {
  filteredItem: Snippet<[any, Id[], ResourceContext]>
} & PanelProps = $props()

// STATE
const selectedLayers = $derived(appCtx.state.prisms.layer)
// Get cached features for counting
const layers = $derived(appCtx.state.resources.layer)

let searchTerm = $state('')

// Reset search term when projects change
$effect(() => {
  layers // track layers
  searchTerm = ''
})

function filterLayers(layers: typeof appCtx.state.resources.layer, term: string) {
  if (!term) return layers

  const searchLower = term.toLowerCase()
  return layers.filter(layer => {
    if (!layer) return false
    return (
      getI18n(layer, 'name', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(layer, 'description', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower)
    )
  })
}

const filteredLayers = $derived(filterLayers(layers, searchTerm))
let isDefaultOpen = $derived(browser ? window.innerHeight > 1000 : false)
const orderedFilteredLayers = $derived.by(() =>
  [...filteredLayers].sort((left, right) => {
    const leftActive = selectedLayers.includes(left.id)
    const rightActive = selectedLayers.includes(right.id)
    if (leftActive !== rightActive) return leftActive ? -1 : 1

    const rankDiff =
      (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER)
    if (rankDiff !== 0) return rankDiff

    return getI18n(left, 'name', appCtx.getUserPreferences()).localeCompare(
      getI18n(right, 'name', appCtx.getUserPreferences()),
    )
  }),
)

let handleReset = () => {
  if (selectedLayers.length === 0) {
    appCtx.closePanel(panelProps.panelType)
  } else {
    appCtx.resetLayers()
  }
}

let collapsedLayers = $derived(
  layers.filter(layer => selectedLayers.includes(layer.id)),
)
</script>

<!-- COMPONENTS -->

{#snippet SelectedLayers()}
  <Panel.Item.SelectedResource
    {resourceType}
    resources={layers}
    selectedIds={selectedLayers}
    {...panelProps}
  />
{/snippet}

{#snippet ManagedLayerItem(layer: (typeof layers)[number])}
  {@const hierarchy = appCtx.getHierarchySync(layer)}
  {@render filteredItem(layer, selectedLayers, hierarchy)}
{/snippet}

{#snippet ManagedLayers(isOpen: boolean)}
  <Panel.Item.ManagedItems
    items={isOpen ? orderedFilteredLayers : collapsedLayers}
    item={ManagedLayerItem}
    flipDurationMs={MANAGED_LIST_FLIP_DURATION_MS}
  />
{/snippet}

<!-- LAYOUT -->
<Section
  {resourceType}
  title={m.maps__layers()}
  icon={Square3Stack3d}
  iconVerticalPaddingClass="py-2"
  iconColorClass="text-secondary"
  collapsedContent={SelectedLayers}
  managedContent={panelProps.isAdmin && panelProps.isNarrow ? ManagedLayers : undefined}
  defaultOpen={isDefaultOpen}
  {...panelProps}
>
  {#if layers.length > 4 && !panelProps.isNarrow}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  {#if !(panelProps.isAdmin && panelProps.isNarrow)}
    <ResourceContainer>
      {#each orderedFilteredLayers as layer (layer.id)}
        {@const hierarchy = appCtx.getHierarchySync(layer)}
        {@render filteredItem(layer, selectedLayers, hierarchy)}
      {/each}
    </ResourceContainer>
  {/if}
</Section>
