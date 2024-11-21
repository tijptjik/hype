<script lang="ts">
import { goto } from '$app/navigation';
// STORES
import { page } from '$app/stores';
import { filteredResources } from '$lib/stores/resources.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';

const layers = $derived(filteredResources.layer);
const routerState = getRouterState();

const onclick = (e: MouseEvent, entity: string) => {
  e.preventDefault();
  routerState.updateWith({
    entity,
    facet: 'core'
  });
  goto(`/admin/layers/${entity}`);
}
</script>

<!-- LAYOUT -->
<ResourceHeader />
<div class="h-full overflow-y-auto bg-gradient-to-bl from-rose-500 to-fuchsia-800 bg-fixed pb-16">
  <div class="container mx-auto flex w-full flex-auto p-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each layers as { data: layer }}
        <div class="card bg-base-100 shadow-xl">
          <figure>
            <img
              src="https://placehold.co/600x400?text={layer.name}"
              alt={layer.name}
              class="h-48 w-full object-cover" />
          </figure>
          <div class="card-body">
            <h2 class="card-title">
              {layer.name} <small class="text-sm text-gray-500">{layer.nameShort}</small>
            </h2>
            <p class="mt-2">{layer.description}</p>
            <div class="mt-4 flex flex-row items-center justify-between">
              <div class="flex flex-wrap gap-2"></div>
              <a href="/admin/layers/{layer.id}{$page.url.search}" 
                 class="btn btn-primary"
                 onclick={(e) => onclick(e, layer.id)}>Edit</a>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
