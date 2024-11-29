<script lang="ts">
// COMPONENTS
import Sidebar from '$lib/components/layout/Sidebar.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';
// CONTEXT
import { setRouterState } from '$lib/context/router.svelte';
import { setHierarchicalResourceState } from '$lib/context/resources.svelte';

// PROPS
let { children } = $props();

// Initialize Router State
const routerState = setRouterState();

// Initialize Hierarchical Resource State
const hierarchicalState = setHierarchicalResourceState();

let viewportContained = $derived(
  routerState.entity == false ||
  routerState.facet == 'address' ||
    routerState.facet == 'images' ||
    (routerState.resource == 'feature' && routerState.facet == 'core') ||
    (routerState.resource == 'task' && routerState.entity)
);

// TODO :: Handle Back and Forward Navigation
</script>

<!-- TODO Implement Toast ⚡ - https://github.com/kbrgl/svelte-french-toast/pull/82 -->

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
