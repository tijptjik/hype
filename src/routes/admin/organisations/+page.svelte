<script lang="ts">
	
  const { data } = $props()
  const {organisations} = data;

  </script>
  
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Your Organisations</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each organisations as org}
        <div class="card bg-base-100 shadow-xl">
          <figure>
            <img src='https://placehold.co/600x400?text={org.name}' alt={org.name} class="w-full h-48 object-cover" />
          </figure>
          <div class="card-body">
            <h2 class="card-title">{org.name} <small class="text-sm text-gray-500">{org.nameShort}</small></h2>
            <p class="mt-2">{org.description}</p>
            <div class="flex flex-row justify-between items-center mt-4">
              <div class="flex flex-wrap gap-2">
                {#each org.userRoles as userRole}
                  <span class="badge badge-outline">{userRole.role}</span>
                {/each}
              </div>
              <a href="/admin/organisations/{org.code}" class="btn btn-primary">View Profile</a>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>