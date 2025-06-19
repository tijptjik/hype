<script lang="ts">
// SVELTE
import { page } from '$app/state';
// LIB
import { ADMIN_PATH } from '$lib/index';
// AUTH
import { hasControlPanelAccess } from '$lib/client/services/auth';
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation';
// COMPONENTS
import IconicMenuButton from '$lib/components/menu/IconicMenuButton.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// ICONS
import {
  InboxArrowDown,
  Map,
  CloudArrowUp,
  BuildingLibrary
} from '@steeze-ui/heroicons';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { SessionUser } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

let notificationCount = $derived(adminCtx.filteredTasks.length);
</script>

{#if adminCtx.appCtx.user && hasControlPanelAccess(adminCtx.appCtx.user as SessionUser)}
  <ul class="menu menu-horizontal m-0 space-x-2 p-0">
    <li>
      <IconicMenuButton
        href={`${ADMIN_PATH}/tasks`}
        iconSrc={InboxArrowDown}
        handleClick={(e) => navigateOnAdmin(adminCtx, FirstClassResource.task)}
        {notificationCount} />
    </li>
    {#if adminCtx.appCtx.isSuperAdmin()}
      <li>
        <IconicMenuButton href={`${ADMIN_PATH}/images/batch`} iconSrc={CloudArrowUp} />
      </li>
      <li>
        <IconicMenuButton href={`${ADMIN_PATH}/hubs`} iconSrc={BuildingLibrary} />
      </li>
    {/if}
    <li>
      <IconicMenuButton
        href={adminCtx.activeResourceType === 'feature' && adminCtx.activeResourceRef
          ? `/features/${adminCtx.activeResourceRef}`
          : '/'}
        iconSrc={Map} />
    </li>
  </ul>
{/if}
