<script lang="ts">
import { filteredResources } from '$lib/stores/resources.svelte';
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import { page } from '$app/stores';

import { getRouterState } from '$lib/context/router.svelte';
import type { ResourceNavProps } from '$lib/types';
import type { ResourceType } from '$lib/types';

const routerState = getRouterState();
let navProps: ResourceNavProps = $derived({
  resource: routerState.resource as ResourceType,
  entity: false,
  facet: false
});

const features = $derived(filteredResources.feature);

const RESOURCE_TYPE = 'feature';
</script>

<!-- LAYOUT -->
<ResourceHeader {...navProps} />
<div class="h-full overflow-y-auto bg-gradient-to-bl from-rose-500 to-fuchsia-800 bg-fixed pb-16">
  <div class="container mx-auto flex w-full flex-auto p-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each features as { data: feature }, idx}
        <div class="card bg-base-100 shadow-xl">
          <figure>
            <img
              src="https://picsum.photos/600/{400 + idx}"
              alt={feature.properties?.title}
              class="h-48 w-full object-cover" />
          </figure>
          <div class="flex flex-row flex-wrap justify-center gap-2 py-2 align-middle">
            <span class="badge badge-primary">{feature.isPublished ? 'Published' : 'Draft'}</span>
            <span class="badge badge-secondary">{feature.properties?.material}</span>
            <span class="badge badge-outline"
              >{feature.isVisitable ? 'Visitable' : 'Not Visitable'}</span>
          </div>
          <div class="card-body">
            <h2 class="card-title">
              {feature.displayAddress}
              <small class="text-sm text-gray-500"
                >{feature.properties?.titleGen ? 'GenAI' : ''}</small>
            </h2>
            <p class="mt-2">{feature.properties?.description}</p>
            <div class="mt-4 flex flex-row items-center justify-end">
              <a href="/admin/features/{feature.id}{$page.url.search}" class="btn btn-primary">View Details</a>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
