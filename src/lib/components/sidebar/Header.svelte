<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Bolt, Bars3 as Menu } from '@steeze-ui/heroicons';
// CONTEXT
import { getSidebarState } from '$lib/context/sidebar.svelte';

// CONTEXT
const sidebarState = getSidebarState();
</script>

<div class="flex flex-shrink-0 flex-row items-center justify-between bg-black p-4">
  {#if sidebarState.isVisuallyOpenState()}
    <div class="invisible h-12 w-12"></div>
    <div class="flex w-full items-center justify-center">
      <Icon src={Bolt} class="h-8 w-8 text-primary" />
    </div>
    <button class="btn btn-circle btn-ghost" onclick={sidebarState.toggleSidebar}>
      <Icon src={Menu} class="h-6 w-6" />
    </button>
  {:else}
    <div
      class="flex w-full items-center justify-center py-2"
      onclick={sidebarState.toggleSidebar}>
      <Icon src={Bolt} class="h-8 w-8 text-primary" />
    </div>
  {/if}
</div>
