<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
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
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Project } from '$lib/types';

// Initialize query client and map state
const appCtx = getAppCtx();

// Get cached features for counting
const projects = $derived(appCtx.state.resources.project);
const selectedProjects = $derived(appCtx.state.prisms.project);

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
    return (
      getI18n(project, 'name', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(project, 'description', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower)
    );
  });
}

const filteredProjects = $derived(filterProjects(projects, searchTerm));
let isDefaultOpen = $derived(document.body.clientHeight > 1000);

let handleReset = () => {
  if (selectedProjects.length == 0) {
    appCtx.closePanel('maps');
  } else {
    appCtx.resetProjects();
  }
};
</script>

<!-- COMPONENTS -->

{#snippet SelectedProjects()}
  <SelectedResources
    {appCtx}
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
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  <ResourceContainer>
    {#each filteredProjects as resource (resource.id)}
      {@const hierarchy = appCtx.getHierarchySync(resource)}
      <FilteredResource
        {resource}
        resourceParent={hierarchy.organisation}
        selectedClass="bg-accent"
        isSelected={selectedProjects.includes(resource.id)}
        onClick={() => appCtx.toggleProject(resource.id)} />
    {/each}
  </ResourceContainer>
</Section>
