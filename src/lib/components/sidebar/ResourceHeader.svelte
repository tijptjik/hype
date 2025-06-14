<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
import { getSidebarState } from '$lib/context/sidebar.svelte';
// NAVIGATION
import { navItems, navigateOnAdmin } from '$lib/navigation';
import { ADMIN_PATH } from '$lib/index';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
// ENUMS
import { ResourcePath } from '$lib/enums';
// TYPES
import type { FirstClassResource, HierarchicalResource } from '$lib/enums';

// CONTEXT
let adminCtx = getAdminCtx();
let sidebarState = getSidebarState();

let { resourceType }: { resourceType: FirstClassResource } = $props();
let onClick = (e: MouseEvent) => {
  e.preventDefault();
  sidebarState.openSection(resourceType as unknown as HierarchicalResource, true);
  navigateOnAdmin(adminCtx, resourceType as FirstClassResource);
};
</script>

<div class="flex-shrink-0">
  <!-- TODO AUTH - Clicking on this link should refresh the cookie cache to ensure the latest roles are being respected https://www.better-auth.com/docs/concepts/session-management#session-caching -->
  <a
    draggable="false"
    href="{ADMIN_PATH}/{ResourcePath[resourceType]}"
    onclick={(e) => onClick(e)}
    class="flex select-none items-center border-l-3 p-6 {adminCtx.activeResourceType ===
      resourceType && !adminCtx.activeResourceRef
      ? 'border-primary'
      : 'border-base-300'} rounded-none">
    <Icon src={navItems[resourceType].icon} class="h-6 w-6" />
    {#if sidebarState.isOpen()}
      <span class="ml-3 font-mono">{navItems[resourceType].name}</span>
    {/if}
  </a>
</div>
