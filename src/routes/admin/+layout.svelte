<script lang="ts">
// LIB
import { ADMIN_MIN_WIDTH } from '$lib/index';
// COMPONENTS
import Sidebar from '$lib/components/sidebar/Root.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';
import MinWidth from '$lib/components/layout/MinWidth.svelte';
// STYLES
import '$lib/styles/admin.css';
import { setHierarchicalResourceState } from '$lib/context/resources.svelte';
import { page } from '$app/stores';
// TYPES
import type { LayoutData } from './$types';
import type { QueryClient } from '@tanstack/svelte-query';

// PROPS
let { children } = $props();

// CONTEXT
const { session, queryClient } = $page.data as LayoutData & {
  queryClient: QueryClient;
};
const resourceState = setHierarchicalResourceState(queryClient);

// STATE
let isMounted = $state(false);

// STATE :: VIEWPORT
let viewportWidth = $state(0);
let isViewportWideEnough = $derived(viewportWidth >= ADMIN_MIN_WIDTH);
let viewportContained = $derived(
  resourceState.activeEntity == false ||
    resourceState.activeFacet == 'address' ||
    resourceState.activeFacet == 'images' ||
    (resourceState.activeResource == 'feature' &&
      resourceState.activeFacet == 'core') ||
    (resourceState.activeResource == 'task' && resourceState.activeEntity)
);

// Initialize active resource and entity based on the current path
$effect(() => {
  if (!isMounted) {
    initViewportListener();
    isMounted = true;
  }
  resourceState.setActiveFromPage($page);
  return () => {
    destroyViewportListener();
  };
});

// UTILS :: VIEWPORT
const handleResize = () => {
  viewportWidth = window.innerWidth;
  $inspect('viewportWidth', viewportWidth);
  $inspect('viewportWidth', isViewportWideEnough);
};
let initViewportListener = () => {
  // Set initial viewport width
  viewportWidth = window.innerWidth;
  window.addEventListener('resize', handleResize);
};
let destroyViewportListener = () => {
  window.removeEventListener('resize', handleResize);
};
</script>

{#if isMounted}
  {#if !isViewportWideEnough}
    <MinWidth {viewportWidth} />
  {:else}
    <!-- LAYOUT -->
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
  {/if}
{/if}

<svelte:head>
  <link rel="stylesheet" href="/src/lib/styles/admin.css" />
</svelte:head>
