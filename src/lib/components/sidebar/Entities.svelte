<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
// TRANSITIONS
import { slide } from 'svelte/transition';
// SERVICES
import { getResourceRef, getUrlForResource } from '$lib/navigation';
// LIB
import { ADMIN_PATH, NEW_REF } from '$lib/index';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getAdminCtx } from '$lib/context/admin.svelte';
import { getSidebarState } from '$lib/context/sidebar.svelte';
// COMPONENTS
import FilterToggle from '$lib/components/sidebar/FilterButton.svelte';
// ENUMS
import { FirstClassResource, HierarchicalResource } from '$lib/enums';
// NAVIGATION
import { navItems, navigateOnAdmin } from '$lib/navigation';
// TYPES
import type {
  Resource,
  Id,
  Code,
  FilterableResourceType,
  FacetType,
  Task
} from '$lib/types';

// CONTEXT
let appCtx = getAppCtx();

let adminCtx = getAdminCtx();
let sidebarState = getSidebarState();
let { resourceType }: { resourceType: FirstClassResource } = $props();

let isCollapsed = $derived(
  adminCtx.hasManyEntities(resourceType) &&
    !sidebarState.isSectionOpen(resourceType as unknown as HierarchicalResource)
);

let entities = $derived.by(() => {
  return adminCtx.getFilteredResource(resourceType);
});

// CONFIG
const filterableByQueryParams: FilterableResourceType[] = [
  FirstClassResource.organisation,
  FirstClassResource.project,
  FirstClassResource.layer
];

let isFilterable = $derived(adminCtx.hasManyEntities(resourceType));
let showFilters = $derived(
  sidebarState.isVisuallyOpenState() &&
    sidebarState.isSectionOpen(resourceType as unknown as HierarchicalResource) &&
    isFilterable
);

let isVisible = (id: Id) => {
  let isVisible = false;
  if (showFilters) {
    isVisible = true;
  } else if (
    navItems[resourceType as Exclude<FirstClassResource, 'property'>].isShownInSidebar
  ) {
    if (adminCtx.activeResourceType === resourceType) {
      isVisible = true;
    } else if (adminCtx.appCtx.isPrism(resourceType, id)) {
      isVisible = true;
    } else if (
      navItems[resourceType as Exclude<FirstClassResource, 'property'>].isAlwaysExpanded
    ) {
      isVisible = true;
    }
  }
  return isVisible;
};

let getDisplayName = (entity: Exclude<Resource, Task>) => {
  return getI18n(
    entity.i18n!,
    {
      [HierarchicalResource.task]: 'title',
      [HierarchicalResource.organisation]: 'name',
      [HierarchicalResource.project]: 'name',
      [HierarchicalResource.layer]: 'name',
      [HierarchicalResource.feature]: 'title'
    }[resourceType as unknown as HierarchicalResource],
    appCtx.getUserPreferences() || {}
  );
};
</script>

<!-- ENTITIES : LIST -->
{#if resourceType}
  <ul
    class="divide-y divide-base-300 bg-base-300 {isCollapsed
      ? 'flex-grow-0 overflow-y-auto'
      : 'overflow-y-scroll'}
        {navItems[resourceType as Exclude<FirstClassResource, 'property'>]
      .isAlwaysExpanded
      ? 'h-0 flex-grow'
      : ''}"
    in:slide={{ duration: 400, axis: 'y' }}
    out:slide={{ duration: 400, axis: 'y' }}>
    {#each entities as entity}
      {@const entityRef: Id | Code = getResourceRef(
        adminCtx,
      resourceType as FirstClassResource,
      entity.id as Id
    ) as Id | Code}
      {@const isActive = adminCtx.activeResourceRef === entityRef}
      {@const href = getUrlForResource(
        adminCtx,
        resourceType as FirstClassResource,
        entity.id as Id
      )}
      {#if isVisible(entity.id as Id)}
        <li class="group relative bg-base-100 drag-none">
          <div class="relative drag-none">
            <a
              draggable="false"
              {href}
              onclick={(e) => {
                e.preventDefault();
                // UGLY HACK - TODO: Fix once SuperForms has proper support for Svelte 5
                if (adminCtx.activeResourceRef === NEW_REF) {
                  window.location.href = href as string;
                } else {
                  navigateOnAdmin(
                    adminCtx,
                    resourceType as FirstClassResource,
                    entityRef,
                    adminCtx.activeFacet as FacetType
                  );
                }
              }}
              class="flex select-none items-center border-l-3 drag-none {!sidebarState.isVisuallyOpenState() &&
              isActive
                ? 'h-[52px] px-4'
                : 'h-[52px] px-6'}"
              class:border-primary={isActive}
              class:border-secondary={!isActive &&
                appCtx.isPrism(resourceType, entity.id as Id)}
              class:border-base-300={!isActive &&
                !appCtx.isPrism(resourceType, entity.id as Id)}>
              {#if sidebarState.isVisuallyOpenState() || !isActive}
                <span class="ml-[6px] h-4 w-4 text-xs text-white/80"> ●</span>
              {:else if isActive}
                <p class="ml-[3px]">
                  <FilterToggle
                    {resourceType}
                    id={entity.id as Id}
                    onHoverOnly={false} />
                </p>
              {/if}
              {#if sidebarState.isVisuallyOpenState()}
                <span class="ml-3 text-sm font-light">
                  {getDisplayName(entity as Exclude<Resource, Task>)}
                </span>
              {/if}
            </a>
            {#if sidebarState.isVisuallyOpenState() && filterableByQueryParams.includes(resourceType as FilterableResourceType)}
              <FilterToggle {resourceType} id={entity.id as Id} />
            {/if}
          </div>
        </li>
      {/if}
    {/each}
  </ul>
{/if}
