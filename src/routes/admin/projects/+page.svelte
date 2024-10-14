<script lang="ts">
import { filteredResources } from '$lib/stores/resources.svelte';

let projects = $derived(filteredResources.project);

</script>

<div class="container mx-auto p-4">
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each projects as { data: project }}
      <div class="card bg-base-100 shadow-xl">
        <figure>
          <img
            src="https://placehold.co/600x400?text={project.name}"
            alt={project.name}
            class="h-48 w-full object-cover" />
        </figure>
        <div class="card-body">
          <h2 class="card-title">
            {project.name} <small class="text-sm text-gray-500">{project.nameShort}</small>
          </h2>
          <p class="mt-2">{project.description}</p>
          <div class="mt-4 flex flex-row items-center justify-between">
            <div class="flex flex-wrap gap-2">
              {#each project.maintainerRoles as maintainerRole}
                <span class="badge badge-outline">{maintainerRole.role}</span>
              {/each}
            </div>
            <a href="/admin/projects/{project.code}/core" class="btn btn-primary">View Profile</a>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
