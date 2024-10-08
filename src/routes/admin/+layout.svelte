<script lang="ts">
import Sidebar from '$lib/components/layout/Sidebar.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';

// PROPS
let { children } = $props();
</script>

<!-- LAYOUT -->
<Sidebar />
<div class="flex w-full flex-col">
  <header class="w-full flex-none bg-black">
    <Navbar />
  </header>
  <main
    class="flex w-full flex-auto overflow-y-auto bg-gradient-to-bl from-rose-500 to-fuchsia-800 bg-fixed">
    {@render children()}
  </main>
</div>
