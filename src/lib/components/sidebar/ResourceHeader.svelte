<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
import { getSidebarState } from '$lib/context/sidebar.svelte';
// NAVIGATION
import { navItems, navigateOnAdmin } from '$lib/navigation';
import { ADMIN_PATH } from '$lib/index';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
// ENUMS
import { HierarchicalResourcePath } from '$lib/types';
// TYPES
import type { HierarchicalResource } from '$lib/types';

// CONTEXT
let resourceState = getHierarchicalResourceState();
let sidebarState = getSidebarState();

let { resourceType }: { resourceType: HierarchicalResource } = $props();
let onClick = (e: MouseEvent) => {
  e.preventDefault();
  sidebarState.openSection(resourceType as HierarchicalResource);
  navigateOnAdmin(resourceState, resourceType as HierarchicalResource);
};
</script>

<div class="flex-shrink-0">
  <a
    draggable="false"
    href="{ADMIN_PATH}/{HierarchicalResourcePath[resourceType]}"
    onclick={(e) => onClick(e)}
    class="flex select-none items-center border-l-3 p-6 {resourceState.activeResource ===
      resourceType && !resourceState.activeEntity
      ? 'border-primary'
      : 'border-base-300'} rounded-none">
    <Icon src={navItems[resourceType].icon} class="h-6 w-6" />
    {#if sidebarState.isOpen()}
      <span class="ml-3 font-mono">{navItems[resourceType].name}</span>
    {/if}
  </a>
</div>
