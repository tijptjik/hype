<script lang="ts">
import Sidebar from '$lib/components/layout/Sidebar.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';
import { setRouterState } from '$lib/context/router.svelte';
import { page } from '$app/stores';

// PROPS
let { children } = $props();

// Initialize Router State
const routerState = setRouterState();
routerState.update();

$effect(() => {
  const currentUrlWithoutHash = getUrlWithoutHash(new URL($page.url));
  const stateUrlWithoutHash = getUrlWithoutHash(routerState.urlState);
  if (currentUrlWithoutHash !== stateUrlWithoutHash) {
    routerState.update();
    $inspect('routerState LAYOUT UPDATED EFFECT', routerState.state);
  }
});

// UTILS
const getUrlWithoutHash = (url: URL) => url.pathname;

</script>

<!-- TODO Implement Toast ⚡ - https://github.com/kbrgl/svelte-french-toast/pull/82 -->

<!-- LAYOUT -->
<Sidebar />
<!-- <div class="flex w-full flex-col"> -->
<div class="flex flex-col w-full h-screen">
  <header class="flex-none bg-black">
    <Navbar />
  </header>
  <main class="flex-1 flex flex-col overflow-hidden h-full">
    {@render children()}
  </main>
</div>
