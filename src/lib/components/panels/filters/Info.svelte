<script lang="ts">
import { m } from '$lib/i18n';
import { slide } from 'svelte/transition';
let { isOpen = false } = $props<{
  isOpen?: boolean;
}>();
</script>

{#if isOpen}
  <div class="flex flex-col gap-4 px-6 py-3" transition:slide>
    <h2 class="text-xl font-bold text-base-content">Help</h2>
    <p class="text-neutral-content">
      Use filters to <b>only</b> show points you are interested in. Select
      <code class="text-primary">Neighbourhoods</code> or filter by any of the
      <code class="text-primary">Categories</code> available in the layers.
    </p>
    <h3 class="text-lg text-base-content">Neighbourhoods</h3>
    <p class="text-neutral-content">
      You can search for region, district, or neighbourhood name. We also show the
      number of points available per neighbourhood for your active layers.
    </p>
    <h3 class="text-lg text-base-content">Difference from layers</h3>
    <p class="text-neutral-content">
      Layers add collections of points to the map. Filters select points from those
      layers, and hide the rest.
    </p>
    <h3 class="text-lg text-base-content">Difference from search</h3>
    <p class="text-neutral-content">
      If you select a neighbourhood from search, this <i>highlights</i>
      and <i>focuses</i> points in the neighbourhood. Filters only <i>remove</i> points that
      don't match your filters.
    </p>
  </div>
{/if}
