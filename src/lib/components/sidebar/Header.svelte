<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Bolt, Bars3 as Menu } from '@steeze-ui/heroicons';
// CONTEXT
import { getSidebarState } from '$lib/context/sidebar.svelte';

// CONTEXT
const sidebarState = getSidebarState();
</script>

<div
  class="flex h-[72px] flex-shrink-0 flex-row items-center justify-between bg-black p-4">
  {#if sidebarState.isVisuallyOpenState()}
    <div class="invisible h-6 w-6"></div>
    <div class="flex w-full items-center justify-center p-1">
      <Icon src={Bolt} class="h-8 w-8 text-primary" />
    </div>
    <button class="btn btn-circle btn-ghost m-0" onclick={sidebarState.toggleSidebar}>
      <Icon src={Menu} class="h-6 w-6" />
    </button>
  {:else}
    <div
      class="m-0 flex w-full items-center justify-center p-1"
      onclick={sidebarState.toggleSidebar}>
      <Icon src={Bolt} class="h-8 w-8 text-primary" />
    </div>
  {/if}
</div>
