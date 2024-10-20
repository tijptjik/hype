<script lang="ts">
import { filteredResources } from '$lib/stores/resources.svelte';
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
  
const organisations = $derived(filteredResources.organisation);

const RESOURCE_TYPE = 'organisation';
</script>

<!-- LAYOUT -->
<ResourceHeader />
<div class="h-full overflow-y-auto bg-gradient-to-bl from-rose-500 to-fuchsia-800 bg-fixed">
  <div class="container mx-auto flex w-full flex-auto p-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each organisations as { data: org }}
        <div class="card bg-base-100 shadow-xl">
          <figure>
            <img
              src="https://placehold.co/600x400?text={org.name}"
              alt={org.name}
              class="h-48 w-full object-cover" />
          </figure>
          <div class="card-body">
            <h2 class="card-title">
              {org.name} <small class="text-sm text-gray-500">{org.nameShort}</small>
            </h2>
            <p class="mt-2">{org.description}</p>
            <div class="mt-4 flex flex-row items-center justify-between">
              <div class="flex flex-wrap gap-2">
                {#each org.userRoles as userRole}
                  <span class="badge badge-outline">{userRole.role}</span>
                {/each}
              </div>
              <!-- TODO Verify if the query params are retained -->
              <a href="/admin/organisations/{org.code}" class="btn btn-primary"
                >View Profile</a>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
