<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// ICONS
import Squares2x2 from 'virtual:icons/lucide/layout-grid'
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
import type { PanelProps, Id, ResourceContext } from '$lib/types'
import type { Snippet } from 'svelte'

// CONTEXT
const appCtx = getAppCtx()
const MANAGED_LIST_FLIP_DURATION_MS = 150

const resourceType = FirstClassResource.project

// PROPS
let {
  filteredItem,
  ...panelProps
}: {
  filteredItem: Snippet<[any, Id[], ResourceContext]>
} & PanelProps = $props()

// Get cached features for counting
const projects = $derived(appCtx.state.resources.project)
const selectedProjects = $derived(appCtx.state.prisms.project)
const visibleProjects = $derived(
  projects.filter(project => project.isArchived !== true),
)

let searchTerm = $state('')

// Reset search term when projects change
$effect(() => {
  projects // track projects
  searchTerm = ''
})

function filterProjects(projects: typeof appCtx.state.resources.project, term: string) {
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

const filteredProjects = $derived(filterProjects(visibleProjects, searchTerm))
let isDefaultOpen = $derived(
  typeof document !== 'undefined' ? document.body.clientHeight > 1000 : false,
)

let handleReset = () => {
  if (selectedProjects.length === 0) {
    appCtx.closePanel(panelProps.panelType)
  } else {
    appCtx.resetProjects()
  }
}

let collapsedProjects = $derived(
  visibleProjects.filter(project => selectedProjects.includes(project.id)),
)
</script>

<!-- COMPONENTS -->

{#snippet SelectedProjects()}
  <Panel.Item.SelectedResource
    {resourceType}
    resources={projects}
    selectedIds={selectedProjects}
    {...panelProps}
  />
{/snippet}

{#snippet ManagedProjectItem(resource: (typeof projects)[number])}
  {@const hierarchy = appCtx.getHierarchySync(resource)}
  {@render filteredItem(resource, selectedProjects, hierarchy)}
{/snippet}

{#snippet ManagedProjects(isOpen: boolean)}
  <Panel.Item.ManagedItems
    items={isOpen ? filteredProjects : collapsedProjects}
    item={ManagedProjectItem}
    flipDurationMs={MANAGED_LIST_FLIP_DURATION_MS}
  />
{/snippet}

<!-- LAYOUT -->
<Section
  {resourceType}
  title={m.maps__projects()}
  icon={Squares2x2}
  iconVerticalPaddingClass="py-2"
  iconColorClass="text-accent"
  collapsedContent={SelectedProjects}
  managedContent={panelProps.isAdmin && panelProps.isNarrow ? ManagedProjects : undefined}
  defaultOpen={isDefaultOpen}
  {...panelProps}
>
  {#if visibleProjects.length > 4 && !panelProps.isNarrow}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  {#if !(panelProps.isAdmin && panelProps.isNarrow)}
    <ResourceContainer>
      {#each filteredProjects as resource (resource.id)}
        {@const hierarchy = appCtx.getHierarchySync(resource)}
        {@render filteredItem(resource, selectedProjects, hierarchy)}
      {/each}
    </ResourceContainer>
  {/if}
</Section>
