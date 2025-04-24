<script lang="ts">
// I18N
import { m, getI18nValue, getLocale } from '$lib/i18n';
// ICONS
import { Squares2x2 } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import FilteredResource from '$lib/components/panels/common/FilteredResource.svelte';
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte';
import SelectedResources from '../common/SelectedResources.svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// TYPES
import type { Project } from '$lib/types';

// Initialize query client and map state
const mapContext = getMapContext();

// Get cached features for counting
const projects = $derived(mapContext.state.resources.project);
const selectedProjects = $derived(mapContext.state.prisms.project);

let searchTerm = $state('');

// Reset search term when projects change
$effect(() => {
  projects; // track projects
  searchTerm = '';
});

function filterProjects(projects: Project[], term: string) {
  if (!term) return projects;

  const searchLower = term.toLowerCase();
  return projects.filter((project) => {
    return getLocale() == 'en'
      ? project.name.toLowerCase().includes(searchLower) ||
          (project.description &&
            project.description.toLowerCase().includes(searchLower))
      : getI18nValue(project, 'nameShort').toLowerCase().includes(searchLower) ||
          getI18nValue(project, 'description').toLowerCase().includes(searchLower);
  });
}

const filteredProjects = $derived(filterProjects(projects, searchTerm));
let isDefaultOpen = $derived(document.body.clientHeight > 1000);
</script>

<!-- COMPONENTS -->

{#snippet SelectedProjects()}
  <SelectedResources
    {mapContext}
    type="project"
    resources={projects}
    selectedIds={selectedProjects}
    colorClass="text-accent" />
{/snippet}

<!-- LAYOUT -->

<Section
  title={m.maps__projects()}
  icon={Squares2x2}
  iconVerticalPaddingClass="pt-2"
  iconColorClass="text-accent"
  collapsedContent={SelectedProjects}
  defaultOpen={isDefaultOpen}>
  {#if projects.length > 4}
    <FilterBar bind:searchTerm />
  {/if}
  <ResourceContainer>
    {#each filteredProjects as resource}
      <FilteredResource
        {resource}
        resourceParent={mapContext.getOrganisation(resource)}
        selectedClass="bg-accent"
        isSelected={selectedProjects.includes(resource.id)}
        onClick={() => mapContext.toggleProject(resource.id)} />
    {/each}
  </ResourceContainer>
</Section>
