<script lang="ts">
// SVELTE
import { page } from '$app/state';
// LIB
import { ADMIN_PATH } from '$lib/index';
// AUTH
import { hasControlPanelAccess } from '$lib/auth/utils';
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation';
// COMPONENTS
import IconicMenuButton from '$lib/components/menu/IconicMenuButton.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/enums';
// ICONS
import { InboxArrowDown, Map, CloudArrowUp } from '@steeze-ui/heroicons';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';

// CONTEXT
const resourceState = getHierarchicalResourceState();

let notificationCount = $derived(resourceState.filteredTasks.length);
</script>

{#if page.data.session && hasControlPanelAccess(page.data.session)}
  <ul class="menu menu-horizontal m-0 space-x-2 p-0">
    <li>
      <IconicMenuButton
        href={`${ADMIN_PATH}/tasks`}
        iconSrc={InboxArrowDown}
        handleClick={(e) => navigateOnAdmin(resourceState, HierarchicalResource.task)}
        {notificationCount} />
    </li>
    <li>
      <IconicMenuButton
        href={`${ADMIN_PATH}/images/batch`}
        iconSrc={CloudArrowUp} />
    </li>
    <li>
      <IconicMenuButton 
        href={resourceState.activeResource === 'feature' && resourceState.activeEntity 
          ? `/features/${resourceState.activeEntity}` 
          : "/"} 
        iconSrc={Map} />
    </li>
  </ul>
{/if}
