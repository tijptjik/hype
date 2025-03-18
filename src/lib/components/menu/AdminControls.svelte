<script lang="ts">
// SVELTE
import { page } from '$app/stores';
// LIB
import { ADMIN_PATH } from '$lib/index';
// AUTH
import { hasControlPanelAccess } from '$lib/auth/utils';
// NAVIGATION
import { navigate } from '$lib/navigation';
// COMPONENTS
import IconicMenuButton from '$lib/components/menu/IconicMenuButton.svelte';
// ICONS
import { InboxArrowDown, Map } from '@steeze-ui/heroicons';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';

// CONTEXT
const resourceState = getHierarchicalResourceState();

const { session } = $page.data;
let notificationCount = $derived(resourceState.filteredTasks.length);
</script>

{#if session && hasControlPanelAccess(session)}
  <ul class="menu menu-horizontal m-0 space-x-2 p-0">
    <li>
      <IconicMenuButton
        href={`${ADMIN_PATH}/tasks`}
        iconSrc={InboxArrowDown}
        handleClick={(e) => navigate(`${ADMIN_PATH}/tasks`)}
        {notificationCount} />
    </li>
    <li>
      <IconicMenuButton href="/" iconSrc={Map} handleClick={(e) => navigate('/')} />
    </li>
  </ul>
{/if}
