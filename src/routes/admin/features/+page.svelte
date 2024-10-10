<script lang="ts">
import { filteredResources } from '$lib/stores/resources.svelte';

let features = $derived(filteredResources.feature);
</script>

<div class="container relative mx-auto h-screen overflow-y-auto p-4">
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each features as { data: feature }, idx}
      <div class="card bg-base-100 shadow-xl">
        <figure>
          <img
            src="https://picsum.photos/600/{400 + idx}"
            alt={feature.properties.title}
            class="h-48 w-full object-cover" />
        </figure>
        <div class="flex flex-row flex-wrap justify-center gap-2 py-2 align-middle">
          <span class="badge badge-primary">{feature.isPublished ? 'Published' : 'Draft'}</span>
          <span class="badge badge-secondary">{feature.properties.material}</span>
          <span class="badge badge-outline"
            >{feature.isVisitable ? 'Visitable' : 'Not Visitable'}</span>
        </div>
        <div class="card-body">
          <h2 class="card-title">
            {feature.addressProperties.formattedAddress}
            <small class="text-sm text-gray-500"
              >{feature.properties.titleGen ? 'GenAI' : ''}</small>
          </h2>
          <p class="mt-2">{feature.properties.description}</p>
          <div class="mt-4 flex flex-row items-center justify-end">
            <a href="/admin/features/{feature.id}" class="btn btn-primary">View Details</a>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
