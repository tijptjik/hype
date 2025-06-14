<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import NewEntityButton from '$lib/components/menu/NewEntityButton.svelte';
// CONFIG
import { navItems } from '$lib/navigation';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// AUTH
import { canManageOrganisations, canCreateProjects } from '$lib/auth/utils';
// TYPES
import type { FirstClassResource } from '$lib/enums';
import { useSession } from '$lib/auth/client';
import type { SessionUser } from '$lib/types';

let session = useSession();
let user = $session.data?.user as SessionUser;

// STATE : CONTEXT :: ROUTER
const adminCtx = getAdminCtx();

// STATE : DERIVED :: RESOURCE MODE
let resource = $derived(adminCtx.activeResourceType);
let resourceMode = $derived(adminCtx.isShowIndex);

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
const canCreateEntity = (user: SessionUser, resource: FirstClassResource): boolean => {
  if (!resource || !user) return false;

  switch (resource) {
    case 'organisation':
      return canManageOrganisations(user);

    case 'project':
      return canCreateProjects(user);

    case 'layer': {
      // For layers, we need to check if user can create layers for any project they have access to
      // This is a simplified check - in practice, you might want to be more specific
      return user.superAdmin === true || 
             user.roles?.some(role => role.type === 'project' && role.role === 'maintainer') === true;
    }

    case 'feature': {
      // For features, we need to check if user can manage features for any project they have access to
      // This is a simplified check - in practice, you might want to be more specific
      return user.superAdmin === true || 
             user.roles?.some(role => 
               role.type === 'project' && 
               (role.role === 'maintainer' || role.role === 'member')
             ) === true;
    }

    case 'task':
      // Tasks cannot be created manually
      return false;

    case 'hub':
      // Only superAdmin can create hubs
      return user.superAdmin === true;

    default:
      return false;
  }
};

// STATE : DERIVED :: SHOW NEW BUTTON
let showNewButton = $derived(user && resource && canCreateEntity(user, resource));
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
