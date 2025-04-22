<script lang="ts">
// I18N
import { m, getI18nValue, languageTag } from '$lib/i18n';
// ICONS
import { UserGroup, Funnel, XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import FilteredResource from '$lib/components/panels/maps/FilteredResource.svelte';
import ResourceContainer from '$lib/components/panels/maps/ResourceContainer.svelte';
import SelectedResources from './SelectedResources.svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// TYPES
import type { Organisation } from '$lib/types';

// Initialize query client and map state
const mapContext = getMapContext();

// Get cached features for counting
const organisations = $derived(mapContext.state.resources.organisation);
const selectedOrganisations = $derived(mapContext.state.prisms.organisation);

let searchTerm = $state('');

$effect(() => {
  organisations; // track organisations
  searchTerm = '';
});

function filterOrganisations(organisations: Organisation[], term: string) {
  if (!term) return organisations;

  const searchLower = term.toLowerCase();
  return organisations.filter((organisation) => {
    return languageTag() == 'en'
      ? organisation.name.toLowerCase().includes(searchLower) ||
          (organisation.description &&
            organisation.description.toLowerCase().includes(searchLower))
      : getI18nValue(organisation, 'nameShort').toLowerCase().includes(searchLower) ||
          getI18nValue(organisation, 'description').toLowerCase().includes(searchLower);
  });
}

const filteredOrganisations = $derived(filterOrganisations(organisations, searchTerm));

let isDefaultOpen = $derived(document.body.clientHeight > 1000);
</script>

<!-- COMPONENTS -->

{#snippet SelectedOrganisations()}
  <SelectedResources
    {mapContext}
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
    <FilterBar bind:searchTerm />
  {/if}
  <ResourceContainer>
    {#each filteredOrganisations as resource}
      <FilteredResource
        {resource}
        isSelected={selectedOrganisations.includes(resource.id)}
        selectedClass="bg-primary"
        onClick={() => mapContext.toggleOrganisation(resource.id)} />
    {/each}
  </ResourceContainer>
</Section>
