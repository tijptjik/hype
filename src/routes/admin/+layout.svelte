<script lang="ts">
import { page } from '$app/stores';
import { getActiveFromPath } from '$lib';
import Sidebar from '$lib/components/layout/Sidebar.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';
import Header from '$lib/components/layout/Header.svelte';
import { meta } from '$lib/stores/resources.svelte';
import { navItems } from '$lib/stores/navigation.svelte';

// PROPS
let { children } = $props();

const active = $derived(() => {
  return getActiveFromPath($page.url.pathname);
});

// STATE : DERIVED
$effect(() => {
  if (active().ref === false) {
    meta.title = (navItems[active().resourceType as keyof typeof navItems].name);
  }
});

</script>

<!-- LAYOUT -->
<Sidebar />
<div class="flex w-full flex-col">
  <header class="w-full flex-none bg-black">
    <Navbar />
  </header>
  <Header {active} />
  <main
    class="flex w-full flex-auto overflow-y-auto bg-gradient-to-bl from-rose-500 to-fuchsia-800 bg-fixed">
    {@render children()}
  </main>
</div>
