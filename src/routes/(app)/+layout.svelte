<script lang="ts">
import Navbar from '$lib/components/layout/Navbar.svelte';

let { children } = $props();
</script>

<div class="flex w-full flex-col">
  <header class="w-full flex-none bg-black">
    <Navbar />
  </header>
  <main class="flex w-full flex-auto">
    {@render children()}
  </main>
</div>