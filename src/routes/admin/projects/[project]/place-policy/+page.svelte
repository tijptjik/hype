<script lang="ts">
// SVELTE
import { page } from '$app/state'
// API
import { getProject } from '#lib/api/project.remote.js'
import { getPlaceUpdatePolicy } from '#lib/api/place.remote.js'
// BITS COMPONENTS
import PlaceUpdatePolicyForm from '#lib/bits/patterns/forms/placeUpdatePolicy/PlaceUpdatePolicyForm.svelte'

const projectRef = $derived(page.params.project ?? '')
const project = $derived(
  getProject({ ref: projectRef, refKey: 'code', meta: { profile: 'admin' } }),
)
</script>

<svelte:head><title>Place update settings</title></svelte:head>

<main class="flex flex-col gap-6 p-6">
  <a class="underline" href={`/admin/projects/${encodeURIComponent(projectRef)}`}
    >Back to project</a
  >
  <h1 class="text-2xl font-semibold">Place update settings</h1>
  <p class="max-w-xl text-sm">
    Source synchronization is not active yet. You can save this project's policy ahead
    of activation.
  </p>
  {#await project}
    <p role="status">Loading project…</p>
  {:then result}
    {#if result.data}
      {#await getPlaceUpdatePolicy({ projectId: result.data.id })}
        <p role="status">Loading settings…</p>
      {:then initial}
        {#key result.data.id}
          <PlaceUpdatePolicyForm projectId={result.data.id} {initial} />
        {/key}
      {:catch}
        <p role="alert">These settings are available to project managers.</p>
      {/await}
    {:else}
      <p role="alert">Project not found.</p>
    {/if}
  {:catch}
    <p role="alert">This project is unavailable or you do not have access.</p>
  {/await}
</main>
