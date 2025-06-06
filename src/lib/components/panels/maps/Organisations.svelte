<script lang="ts">
// I18N
import { getI18n, getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// ICONS
import { UserGroup, Funnel, XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import FilteredResource from '$lib/components/panels/common/FilteredResource.svelte';
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte';
import SelectedResources from '../common/SelectedResources.svelte';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
// TYPES
import type { Organisation } from '$lib/types';

// Initialize query client and map state
const mapCtx = getMapCtx();

// Get cached features for counting
const organisations = $derived(mapCtx.state.resources.organisation);
const selectedOrganisations = $derived(mapCtx.state.prisms.organisation);

let searchTerm = $state('');

$effect(() => {
  organisations; // track organisations
  searchTerm = '';
});

function filterOrganisations(organisations: Organisation[], term: string) {
  if (!term) return organisations;

  const searchLower = term.toLowerCase();
  return organisations.filter((organisation) => {
    return (
      getI18n(organisation, 'nameShort', mapCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(organisation, 'name', mapCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(organisation, 'description', mapCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower)
    );
  });
}

const filteredOrganisations = $derived(filterOrganisations(organisations, searchTerm));

let isDefaultOpen = $derived(document.body.clientHeight > 1000);


let handleReset = () => {
  if (selectedOrganisations.length == 0) {
    mapCtx.closePanel('maps')
  } else {
    mapCtx.resetOrganisations()
  }
}
</script>

<!-- COMPONENTS -->

{#snippet SelectedOrganisations()}
  <SelectedResources
    {mapCtx}
    type="organisation"
    resources={organisations}
    selectedIds={selectedOrganisations}
    colorClass="text-primary" />
{/snippet}

<!-- LAYOUT -->

<Section
  title={m.maps__organisations()}
  icon={UserGroup}
  iconVerticalPaddingClass="pt-2"
  iconColorClass="text-primary"
  collapsedContent={SelectedOrganisations}
  defaultOpen={isDefaultOpen}>
  {#if organisations.length > 4}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  <ResourceContainer>
    {#each filteredOrganisations as resource}
      <FilteredResource
        {resource}
        isSelected={selectedOrganisations.includes(resource.id)}
        selectedClass="bg-primary"
        onClick={() => mapCtx.toggleOrganisation(resource.id)} />
    {/each}
  </ResourceContainer>
</Section>
