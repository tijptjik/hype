<script lang="ts">
import { m } from '$lib/i18n';
import { slide } from 'svelte/transition';
let { isOpen = false } = $props<{
  isOpen?: boolean;
}>();
</script>

{#if isOpen}
  <div class="flex flex-col gap-4 px-6 py-3" transition:slide>
    <h2 class="text-xl font-bold text-base-content">How to</h2>
    <h3 class="text-lg text-base-content">Show points on the map</h3>
    <p class="text-neutral-content">
      Points are grouped together in <i>Layers</i>. You can toggle their visibility in
      the
      <code class="text-primary">Layers</code> section below.
    </p>
    <h3 class="text-lg text-base-content">Focus on your interests</h3>
    <p class="text-neutral-content">
      Each layer is part of a <i>Project</i> and offered by an <i>Organisation</i>. If
      you are interested in specific one, select them in the
      <code class="text-primary">Organisations</code>
      and <code class="text-primary">Projects</code> sections below. The layers will be filtered
      accordingly.
    </p>
    <p class="text-neutral-content">
      Breadcrumbs above the layer name show you which project and organisation the layer
      belongs to.
    </p>
  </div>
{/if}
