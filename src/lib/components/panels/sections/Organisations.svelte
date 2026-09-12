<!--
  @component
  Organisations section component that displays a filterable list of organisations
  with selection capabilities and optional admin controls.
-->
<script lang="ts">
// SVELTE
// I18N
import { m } from '$lib/i18n'
// ICONS
import UserGroup from 'virtual:icons/lucide/users'
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
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Id, PanelProps } from '$lib/types'
import type { Snippet } from 'svelte'

// Initialize query client and map state
const appCtx = getAppCtx()

const resourceType = FirstClassResource.organisation

// PROPS
let {
  filteredItem,
  ...panelProps
}: {
  filteredItem: Snippet<[Organisation, Id[]]>
} & PanelProps = $props()

// Get cached features for counting
let searchTerm = $state('')
const panelResources = usePanelResources(appCtx, 'organisation', () => searchTerm)
const organisations = $derived(
  panelResources.rows as unknown as typeof appCtx.state.resources.organisation,
)
const selectedOrganisations = $derived(appCtx.state.prisms.organisation)
const visibleOrganisations = $derived(
  organisations.filter(organisation => organisation.isArchived !== true),
)

const filteredOrganisations = $derived(visibleOrganisations)

const orderedFilteredOrganisations = $derived.by(() =>
  [...filteredOrganisations].sort((left, right) => {
    const leftActive =
      selectedOrganisations.includes(left.id) ||
      appCtx.isOrganisationDefaultLayersActive(left.id)
    const rightActive =
      selectedOrganisations.includes(right.id) ||
      appCtx.isOrganisationDefaultLayersActive(right.id)

    if (leftActive === rightActive) return 0
    return leftActive ? -1 : 1
  }),
)
let isDefaultOpen = $derived(
  typeof window !== 'undefined' ? document.body.clientHeight > 1000 : false,
)

let handleReset = () => {
  if (selectedOrganisations.length === 0) {
    appCtx.closePanel(panelProps.panelType)
  } else {
    appCtx.resetOrganisations()
  }
}

let collapsedOrganisations = $derived(
  visibleOrganisations.filter(organisation =>
    selectedOrganisations.includes(organisation.id),
  ),
)
</script>

<!-- COMPONENTS -->
{#snippet SelectedOrganisations()}
  <Panel.Item.SelectedResource
    {resourceType}
    resources={organisations}
    selectedIds={selectedOrganisations}
    {...panelProps}
  />
{/snippet}

{#snippet ManagedOrganisationItem(resource: (typeof organisations)[number])}
  {@render filteredItem(resource, selectedOrganisations)}
{/snippet}

{#snippet ManagedOrganisations(isOpen: boolean)}
  <VirtualResourceList
    items={isOpen ? orderedFilteredOrganisations : collapsedOrganisations}
    item={ManagedOrganisationItem}
    onNearEnd={isOpen ? () => panelResources.list.next() : undefined}
    loading={panelResources.list.loading}
    error={Boolean(panelResources.list.error)}
    onRetry={panelResources.retry}
    viewKey={panelResources.viewKey}
  />
{/snippet}

<!-- LAYOUT -->
<Section
  {resourceType}
  title={m.maps__organisations()}
  rootClass="pt-0"
  icon={UserGroup}
  iconVerticalPaddingClass="py-2"
  iconColorClass="text-primary"
  collapsedContent={SelectedOrganisations}
  managedContent={panelProps.isAdmin && panelProps.isNarrow ? ManagedOrganisations : undefined}
  defaultOpen={panelProps.isAdmin ? isDefaultOpen : false}
  {...panelProps}
>
  {#if !panelProps.isNarrow}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  {#if !(panelProps.isAdmin && panelProps.isNarrow)}
    <VirtualResourceList
      items={orderedFilteredOrganisations}
      item={ManagedOrganisationItem}
      onNearEnd={() => panelResources.list.next()}
      loading={panelResources.list.loading}
      error={Boolean(panelResources.list.error)}
      onRetry={panelResources.retry}
      viewKey={panelResources.viewKey}
    />
  {/if}
</Section>
