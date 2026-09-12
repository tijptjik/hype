<script lang="ts">
// SVELTE
import { browser } from '$app/environment'
// I18N
import { getI18n, m } from '$lib/i18n'
// ICONS
import Square3Stack3d from 'virtual:icons/lucide/layers-3'
// COMPONENTS
import * as Panel from '$lib/bits/patterns/panels'
import Section from '$lib/components/panels/common/Section.svelte'
import FilterBar from '$lib/components/panels/common/FilterBar.svelte'
import VirtualResourceList from '$lib/bits/custom/resources/VirtualResourceList.svelte'
import { usePanelResources } from '$lib/context/panel-resources.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { ResourceContext, Id, PanelProps } from '$lib/types'
import type { Snippet } from 'svelte'

// Connect retained remote resources and map state
const appCtx = getAppCtx()
const resourceType = FirstClassResource.layer

// PROPS
let {
  filteredItem,
  ...panelProps
}: {
  filteredItem: Snippet<[Layer, Id[], ResourceContext]>
} & PanelProps = $props()

// STATE
let searchTerm = $state('')
const panelResources = usePanelResources(appCtx, 'layer', () => searchTerm)
const selectedLayers = $derived(appCtx.state.prisms.layer)
// Get cached features for counting
const layers = $derived(
  panelResources.rows as unknown as typeof appCtx.state.resources.layer,
)
const visibleLayers = $derived(layers.filter(layer => layer.isArchived !== true))

const filteredLayers = $derived(visibleLayers)

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
let isDefaultOpen = $derived(browser ? window.innerHeight > 1000 : false)

let handleReset = () => {
  if (selectedLayers.length === 0) {
    appCtx.closePanel(panelProps.panelType)
  } else {
    appCtx.resetLayers()
  }
}

let collapsedLayers = $derived(
  visibleLayers.filter(layer => selectedLayers.includes(layer.id)),
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
  <VirtualResourceList
    items={isOpen ? orderedFilteredLayers : collapsedLayers}
    item={ManagedLayerItem}
    onNearEnd={isOpen ? () => panelResources.list.next() : undefined}
    loading={panelResources.list.loading}
    error={Boolean(panelResources.list.error)}
    onVisibleItems={rows => { panelResources.list.visibleIds = new Set(rows.map(row => row.id)) }}
    onRetry={panelResources.retry}
    viewKey={panelResources.viewKey}
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
  {#if !panelProps.isNarrow}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  {#if !(panelProps.isAdmin && panelProps.isNarrow)}
    <VirtualResourceList
      items={orderedFilteredLayers}
      item={ManagedLayerItem}
      onNearEnd={() => panelResources.list.next()}
      loading={panelResources.list.loading}
      error={Boolean(panelResources.list.error)}
      onVisibleItems={rows => { panelResources.list.visibleIds = new Set(rows.map(row => row.id)) }}
      onRetry={panelResources.retry}
      viewKey={panelResources.viewKey}
    />
  {/if}
</Section>
