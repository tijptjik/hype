<!--
  @component
  Organisations section component that displays a filterable list of organisations
  with selection capabilities and optional admin controls.
-->
<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// ICONS
import { UserGroup } from '@steeze-ui/heroicons';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte';
import SelectedResources from '../elements/SelectedResources.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { Id, Organisation, PanelProps } from '$lib/types';
import type { Snippet } from 'svelte';

// Initialize query client and map state
const appCtx = getAppCtx();

const resourceType = FirstClassResource.organisation;

// PROPS
let {
  filteredItem,
  ...panelProps
}: {
  filteredItem: Snippet<[Organisation, Id[]]>;
} & PanelProps = $props();

// Get cached features for counting
const organisations = $derived(appCtx.state.resources.organisation);
const selectedOrganisations = $derived(appCtx.state.prisms.organisation);

let searchTerm = $state('');

$effect(() => {
  organisations; // track organisations
  searchTerm = '';
});

const filteredOrganisations = $derived(
  appCtx.getFilteredResource(FirstClassResource.organisation)
);
let isDefaultOpen = $derived(
  typeof window !== 'undefined' ? document.body.clientHeight > 1000 : false
);

let handleReset = () => {
  if (selectedOrganisations.length == 0) {
    appCtx.closePanel(panelProps.panelType);
  } else {
    appCtx.resetOrganisations();
  }
};
</script>

<!-- COMPONENTS -->
{#snippet SelectedOrganisations()}
  <SelectedResources
    {resourceType}
    resources={organisations}
    selectedIds={selectedOrganisations}
    colorClass="text-primary"
    {...panelProps} />
{/snippet}

<!-- LAYOUT -->
<Section
  {resourceType}
  title={m.maps__organisations()}
  icon={UserGroup}
  iconVerticalPaddingClass="pt-2"
  iconColorClass="text-primary"
  collapsedContent={appCtx.isAdmin() ? SelectedOrganisations : undefined}
  defaultOpen={isDefaultOpen}
  {...panelProps}>
  {#if organisations.length > 4 && !panelProps.isNarrow}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  <ResourceContainer>
    {#each filteredOrganisations as resource (resource.id)}
      {@render filteredItem(resource as Organisation, selectedOrganisations)}
    {/each}
  </ResourceContainer>
</Section>
