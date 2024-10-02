<script lang="ts">
import type { feature } from '$lib/db/schema';

const { data } = $props<{ data: { features: (typeof feature)[] } }>();
const { features } = data;
</script>

<div class="relative container mx-auto p-4 overflow-y-auto h-screen">
  <!-- <h1 class="mb-4 text-2xl font-bold">Your Features</h1> -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each features as feature, idx}
      <div class="card bg-base-100 shadow-xl">
        <figure>
          <img
            src="https://picsum.photos/600/{400 + idx}"
            alt={feature.properties.title}
            class="h-48 w-full object-cover" />
        </figure>
        <div class="flex flex-row flex-wrap gap-2 py-2 align-middle justify-center">
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
