<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// LIB
import { ADMIN_MIN_WIDTH } from '$lib/index';
// COMPONENTS
import Sidebar from '$lib/components/sidebar/Root.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';
import MinWidthProtector from '$lib/components/layout/MinWidth.svelte';
// STYLES
import '$lib/styles/admin.css';
// CONTEXT
import { setHierarchicalResourceState } from '$lib/context/resources.svelte';
import { setMapContext } from '$lib/context/map.svelte';
// STORES
import { page } from '$app/stores';
import { goto } from '$app/navigation';
// TYPES
import type { LayoutData } from './$types';
import type { QueryClient } from '@tanstack/svelte-query';
import { setSidebarState } from '$lib/context/sidebar.svelte';
import { HierarchicalResource } from '$lib/types';

// PROPS
let { children } = $props();

// CONTEXT
const { session, queryClient } = $page.data as LayoutData & {
  queryClient: QueryClient;
};
const resourceState = setHierarchicalResourceState(
  queryClient,
  session?.user.roles ?? []
);
setMapContext(queryClient, session?.user.id ?? '', session?.user.userLayers ?? []);
const sidebarState = setSidebarState();

let viewportContained = $derived(
  resourceState.activeEntity == false ||
    resourceState.activeFacet == 'address' ||
    resourceState.activeFacet == 'images' ||
    (resourceState.activeResource == 'feature' &&
      (resourceState.activeFacet == 'core' || resourceState.activeFacet == false)) ||
    (resourceState.activeResource == 'task' && resourceState.activeEntity)
);

// Initialize active resource and entity based on the current path
let isMounted = $state(false);
onMount(() => {
  isMounted = true;
});
</script>

<!-- LAYOUT -->
<MinWidthProtector>
  {#if isMounted}
    <Sidebar />
    <div class="flex h-screen w-full select-none flex-col drag-none">
      <header class="flex-none bg-black">
        <Navbar />
      </header>
      <main
        class="flex h-full flex-1 flex-col overflow-hidden"
        class:pb-[72px]={!viewportContained}>
        {@render children()}
      </main>
    </div>
  {:else}
    <div class="flex h-screen w-full items-center justify-center">
      <div class="loading loading-spinner loading-lg"></div>
    </div>
  {/if}
</MinWidthProtector>

<svelte:head>
  <link rel="stylesheet" href="/src/lib/styles/admin.css" />
</svelte:head>
