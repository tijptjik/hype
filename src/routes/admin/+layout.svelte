<script lang="ts">
import Sidebar from '$lib/components/layout/Sidebar.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';
import { page } from '$app/stores';

// PROPS
let { children } = $props();

// STATE
let queryFilters = $state({
  organisations: [],
  projects: [],
  layers: []
});

// EFFECTS
// $effect(() => {
//   const params = $page.url.searchParams;
//   Object.keys(queryFilters).forEach(filter => {
//     const values = params.getAll(filter);
//     queryFilters[filter as keyof typeof queryFilters] = values as never;
//   });
// });

</script>

<!-- LAYOUT -->
<Sidebar />
<div class="flex w-full flex-col">
  <header class="w-full flex-none bg-black">
    <Navbar />
  </header>
  <main class="flex w-full flex-auto overflow-y-auto bg-fixed bg-gradient-to-bl from-rose-500 to-fuchsia-800">
    {@render children()}
  </main>
</div>