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
</script>

<!-- TODO Implement Toast ⚡ - https://github.com/kbrgl/svelte-french-toast/pull/82 -->

<!-- LAYOUT -->
<Sidebar />
<!-- <div class="flex w-full flex-col"> -->
<div class="flex h-screen w-full flex-col">
  <header class="flex-none bg-black">
    <Navbar />
  </header>
  <main class="flex h-full flex-1 flex-col overflow-hidden">
    {@render children()}
  </main>
</div>
