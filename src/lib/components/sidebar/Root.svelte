<script lang="ts">
// COMPONENTS
import Header from '$lib/components/sidebar/Header.svelte';
import Sections from '$lib/components/sidebar/Sections.svelte';
// CONTEXT
import { getSidebarState } from '$lib/context/sidebar.svelte';

// CONTEXT
const sidebarState = getSidebarState();
</script>

<!-- COMPONENT -->
<aside
  class="flex-shrink-1 flex h-screen flex-col bg-base-300 caret-transparent transition-all"
  style="width: {sidebarState.getWidth()}px">
  <Header />
  <Sections />
</aside>
