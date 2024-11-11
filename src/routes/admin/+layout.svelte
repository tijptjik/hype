<script lang="ts">
import Sidebar from '$lib/components/layout/Sidebar.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';
import { setRouterState } from '$lib/context/router.svelte';
import { page } from '$app/stores';
import { appMeta } from '$lib/stores/resources.svelte';
import { navItems } from '$lib/stores/navigation.svelte';

// PROPS
let { children } = $props();

// Initialize Router State
const routerState = setRouterState();
routerState.update();

$effect(() => {
  const getUrlWithoutHash = (url: URL) => url.pathname;

  const currentUrlWithoutHash = getUrlWithoutHash(new URL($page.url));
  const stateUrlWithoutHash = getUrlWithoutHash(routerState.urlState);
  if (currentUrlWithoutHash !== stateUrlWithoutHash) {
    routerState.update();
    if (routerState.entity === false) {
      appMeta.meta = {
        ...appMeta.meta,
        title: navItems[routerState.resource as keyof typeof navItems].name
      };
    }
  }
});

</script>

<!-- TODO Implement Toast ⚡ - https://github.com/kbrgl/svelte-french-toast/pull/82 -->

<!-- LAYOUT -->
<Sidebar />
<!-- <div class="flex w-full flex-col"> -->
<div class="flex flex-col w-full">
  <header class="flex-none bg-black">
    <Navbar />
  </header>
  <main class="h-full pb-16">
    {@render children()}
  </main>
</div>
