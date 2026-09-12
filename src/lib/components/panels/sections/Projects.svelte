<script lang="ts">
// SVELTE
// I18N
import { m } from '$lib/i18n'
// ICONS
import Squares2x2 from 'virtual:icons/lucide/layout-grid'
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
import type { Project } from '$lib/db/zod/schema/project.types'
import type { PanelProps, Id, ResourceContext } from '$lib/types'
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
let searchTerm = $state('')
const panelResources = usePanelResources(appCtx, 'project', () => searchTerm)
const projects = $derived(
  panelResources.rows as unknown as typeof appCtx.state.resources.project,
)
const selectedProjects = $derived(appCtx.state.prisms.project)
const visibleProjects = $derived(
  projects.filter(project => project.isArchived !== true),
)

const filteredProjects = $derived(visibleProjects)

const orderedFilteredProjects = $derived.by(() =>
  [...filteredProjects].sort((left, right) => {
    const leftActive =
      selectedProjects.includes(left.id) || appCtx.isProjectDefaultLayersActive(left.id)
    const rightActive =
      selectedProjects.includes(right.id) ||
      appCtx.isProjectDefaultLayersActive(right.id)

    if (leftActive === rightActive) return 0
    return leftActive ? -1 : 1
  }),
)
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
  <VirtualResourceList
    items={isOpen ? orderedFilteredProjects : collapsedProjects}
    item={ManagedProjectItem}
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
  title={m.maps__projects()}
  icon={Squares2x2}
  iconVerticalPaddingClass="py-2"
  iconColorClass="text-accent"
  collapsedContent={SelectedProjects}
  managedContent={panelProps.isAdmin && panelProps.isNarrow ? ManagedProjects : undefined}
  defaultOpen={isDefaultOpen}
  {...panelProps}
>
  {#if !panelProps.isNarrow}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  {#if !(panelProps.isAdmin && panelProps.isNarrow)}
    <VirtualResourceList
      items={orderedFilteredProjects}
      item={ManagedProjectItem}
      onNearEnd={() => panelResources.list.next()}
      loading={panelResources.list.loading}
      error={Boolean(panelResources.list.error)}
      onRetry={panelResources.retry}
      viewKey={panelResources.viewKey}
    />
  {/if}
</Section>
