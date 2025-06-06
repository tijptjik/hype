<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// COMPONENTS
import TaskHeader from '$lib/components/layout/TaskHeader.svelte';
import TaskIndex from '$lib/components/tasks/layout/Index.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/enums';

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setResource(HierarchicalResource.task);
resourceState.setEntity(false);
resourceState.setFacet(false);
</script>

<TaskHeader />
<div
  class="from-rose-500 h-full overflow-y-auto bg-gradient-to-br to-indigo-700 bg-fixed pb-6">
  <TaskIndex />
</div>
