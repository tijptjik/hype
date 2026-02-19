<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// ICONS
import { Squares2x2 } from '@steeze-ui/heroicons'
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte'
import FilterBar from '$lib/components/panels/common/FilterBar.svelte'
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte'
import SelectedResources from '$lib/components/panels/elements/SelectedResources.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { PanelProps, Project, Id, ResourceContext } from '$lib/types'
import type { Snippet } from 'svelte'

// CONTEXT
const appCtx = getAppCtx()

const resourceType = FirstClassResource.project

// PROPS
let {
  filteredItem,
  ...panelProps
}: {
  filteredItem: Snippet<[Project, Id[], ResourceContext]>
} & PanelProps = $props()

// Get cached features for counting
const projects = $derived(appCtx.state.resources.project)
const selectedProjects = $derived(appCtx.state.prisms.project)

let searchTerm = $state('')

// Reset search term when projects change
$effect(() => {
  projects // track projects
  searchTerm = ''
})

function filterProjects(projects: Project[], term: string) {
  if (!term) return projects

  const searchLower = term.toLowerCase()
  return projects.filter(project => {
    return (
      getI18n(project, 'name', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(project, 'description', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower)
    )
  })
}

const filteredProjects = $derived(filterProjects(projects, searchTerm))
let isDefaultOpen = $derived(
  typeof document !== 'undefined' ? document.body.clientHeight > 1000 : false,
)

let handleReset = () => {
  if (selectedProjects.length == 0) {
    appCtx.closePanel(panelProps.panelType)
  } else {
    appCtx.resetProjects()
  }
}
</script>

<!-- COMPONENTS -->

{#snippet SelectedProjects()}
  <SelectedResources
    {resourceType}
    resources={projects}
    selectedIds={selectedProjects}
    colorClass="text-accent"
    {...panelProps}
  />
{/snippet}

<!-- LAYOUT -->
<Section
  {resourceType}
  title={m.maps__projects()}
  icon={Squares2x2}
  iconVerticalPaddingClass="pt-2"
  iconColorClass="text-accent"
  collapsedContent={SelectedProjects}
  defaultOpen={isDefaultOpen}
  {...panelProps}
>
  {#if projects.length > 4 && !panelProps.isNarrow}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  <ResourceContainer>
    {#each filteredProjects as resource (resource.id)}
      {@const hierarchy = appCtx.getHierarchySync(resource)}
      {@render filteredItem(resource, selectedProjects, hierarchy)}
    {/each}
  </ResourceContainer>
</Section>
