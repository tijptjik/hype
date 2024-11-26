<script lang="ts">
import { goto, beforeNavigate } from '$app/navigation';

// STORES
import { filteredResources } from '$lib/stores/resources.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import TaskIndex from '$lib/components/layout/TaskIndex.svelte';

// STATE :: ROUTER
const routerState = getRouterState();

// STATE :: ROUTER
routerState.updateWith({
  resource: 'task',
  entity: false,
  facet: false
});

// STATE :: DERIVED :: TASKS
const tasks = $derived(filteredResources.task);
</script>

  <ResourceHeader />
  <div
    class="h-full overflow-y-auto bg-gradient-to-br from-rose-500 to-indigo-700 bg-fixed pb-6">
    <TaskIndex {tasks} />
  </div>
