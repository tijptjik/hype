<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import TaskHeader from '$lib/components/layout/TaskHeader.svelte';
import TaskIndex from '$lib/components/tasks/layout/Index.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';

// CONTEXT
const adminCtx = getAdminCtx();
adminCtx.setResource(FirstClassResource.task);
adminCtx.setEntity(false);
adminCtx.setFacet(false);
</script>

<TaskHeader />
<div
  class="h-full overflow-y-auto bg-gradient-to-br from-rose-500 to-indigo-700 bg-fixed pb-6">
  <TaskIndex />
</div>
