<!--
  @component
  Organisations section component that displays a filterable list of organisations
  with selection capabilities and optional admin controls.
-->
<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// ICONS
import UserGroup from 'virtual:icons/lucide/users'
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
import type { Id, PanelProps } from '$lib/types'
import type { Snippet } from 'svelte'

// Initialize query client and map state
const appCtx = getAppCtx()
const MANAGED_LIST_FLIP_DURATION_MS = 150

const resourceType = FirstClassResource.organisation

// PROPS
let {
  filteredItem,
  ...panelProps
}: {
  filteredItem: Snippet<[any, Id[]]>
} & PanelProps = $props()

// Get cached features for counting
const organisations = $derived(appCtx.state.resources.organisation)
const selectedOrganisations = $derived(appCtx.state.prisms.organisation)

let searchTerm = $state('')

$effect(() => {
  organisations // track organisations
  searchTerm = ''
})

function filterOrganisations(
  organisations: typeof appCtx.state.resources.organisation,
  term: string,
) {
  if (!term) return organisations

  const searchLower = term.toLowerCase()
  return organisations.filter(organisation => {
    return (
      getI18n(organisation, 'name', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(organisation, 'description', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower)
    )
  })
}

const filteredOrganisations = $derived(filterOrganisations(organisations, searchTerm))
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
  organisations.filter(organisation => selectedOrganisations.includes(organisation.id)),
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
  <Panel.Item.ManagedItems
    items={isOpen ? filteredOrganisations : collapsedOrganisations}
    item={ManagedOrganisationItem}
    flipDurationMs={MANAGED_LIST_FLIP_DURATION_MS}
  />
{/snippet}

<!-- LAYOUT -->
<Section
  {resourceType}
  title={m.maps__organisations()}
  icon={UserGroup}
  iconVerticalPaddingClass="py-2"
  iconColorClass="text-primary"
  collapsedContent={SelectedOrganisations}
  managedContent={panelProps.isAdmin && panelProps.isNarrow ? ManagedOrganisations : undefined}
  defaultOpen={panelProps.isAdmin ? isDefaultOpen : false}
  {...panelProps}
>
  {#if organisations.length > 4 && !panelProps.isNarrow}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  {#if !(panelProps.isAdmin && panelProps.isNarrow)}
    <ResourceContainer>
      {#each filteredOrganisations as resource (resource.id)}
        {@render filteredItem(resource, selectedOrganisations)}
      {/each}
    </ResourceContainer>
  {/if}
</Section>
