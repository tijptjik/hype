<script lang="ts">
import type { layer } from '$lib/db/schema';

const { data } = $props<{ data: { layers: (typeof layer)[] } }>();
const { layers } = data;

$inspect(layers);
</script>

<div class="container mx-auto p-4">
  <h1 class="mb-4 text-2xl font-bold">Your Layers</h1>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each layers as layer}
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
            <div class="flex flex-wrap gap-2">
            </div>
            <a href="/admin/layers/{layer.id}" class="btn btn-primary">Edit</a>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
