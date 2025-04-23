<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import TaskIndex from '$lib/components/tasks/layout/Index.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setResource(HierarchicalResource.task);
resourceState.setEntity(false);
resourceState.setFacet(false);
</script>

<ResourceHeader />
<div
  class="from-rose-500 h-full overflow-y-auto bg-gradient-to-br to-indigo-700 bg-fixed pb-6">
  <TaskIndex />
</div>
