<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import NewEntityButton from '$lib/components/menu/NewEntityButton.svelte';
// CONFIG
import { navItems } from '$lib/navigation';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// TYPES
import type { FirstClassResource, HierarchicalResource } from '$lib/enums';

// STATE : CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

// STATE : DERIVED :: RESOURCE MODE
let resource = $derived(resourceState.activeResource);
let resourceMode = $derived(resourceState.isShowIndex);

// STATE : DERIVED :: TITLE
let title = $derived(resource ? navItems[resource].name : '');

// ═══════════════════════
// PERMISSION CHECKING
// ═══════════════════════

/**
 * Check if the user can create new entities for the given resource type
 * @param resource - The resource type to check permissions for
 * @returns boolean indicating if new buttons should be shown
 */
const canCreateEntity = (resource: FirstClassResource): boolean => {
  if (!resource || !resourceState.session) return false;

  const { session, userRoles } = resourceState;
  const isSuperAdmin = session.user?.superAdmin === true;

  // SuperAdmin can create anything
  if (isSuperAdmin) return true;

  switch (resource) {
    case 'organisation':
      // Only superAdmin can create organisations
      return false;

    case 'project': {
      // Only owners of organisation or superAdmin
      return userRoles.some(
        (role) => role.type === 'organisation' && role.role === 'owner'
      );
    }

    case 'layer': {
      // Only maintainers of projects or superAdmin
      return userRoles.some(
        (role) => role.type === 'project' && role.role === 'maintainer'
      );
    }

    case 'feature': {
      // Any role in the project or superAdmin
      return userRoles.some(
        (role) =>
          role.type === 'project' &&
          (role.role === 'maintainer' || role.role === 'member')
      );
    }

    case 'task':
      // Tasks cannot be created manually
      return false;

    case 'hub':
      // Only superAdmin can create hubs
      return false;

    default:
      return false;
  }
};

// STATE : DERIVED :: SHOW NEW BUTTON
let showNewButton = $derived(resource && canCreateEntity(resource));
</script>

{#if resource}
  <header
    class="navbar h-17.5 px-12 py-4 shadow-lg"
    class:bg-base-300={resourceMode}
    class:bg-gradient-to-r={!resourceMode}
    class:from-rose-500={!resourceMode}
    class:to-fuchsia-800={!resourceMode}>
    <div class="flex-1">
      <div class="flex items-center space-x-4">
        <Icon src={navItems[resource as FirstClassResource].icon} class="h-6 w-6" />
        <h2 class="text-2xl font-semibold">{title}</h2>
      </div>
    </div>
    <div class="flex flex-none items-center space-x-5">
      {#if showNewButton}
        <NewEntityButton />
        <div class="divider divider-horizontal"></div>
      {/if}
      <FilterInput
        resourceType={resource as FirstClassResource}
        rounded={true}
        showUnpublishedToggle={resource !== 'task'}
        showReviewedToggle={resource === 'task'} />
    </div>
  </header>
{/if}
