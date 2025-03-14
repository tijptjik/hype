<script lang="ts">
// NAVIGATION
import { navItems } from '$lib/navigation';
// COMPONENTS
import Section from './Section.svelte';
</script>

<div
  class="flex flex-shrink-0 flex-grow select-none flex-col overflow-hidden border-r-2 border-base-300 p-0">
  {#each Object.entries(navItems).filter(([_, resource]) => resource.isShownInSidebar) as [resourceType, resource]}
    <Section {resourceType} />
  {/each}
</div>
