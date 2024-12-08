<script lang="ts">
// LIB
import { goToEntity } from '$lib';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight } from '@steeze-ui/heroicons';
// TYPES
import type { TaskAPI, TaskType, EntityRouter } from '$lib/types';

let { task }: { task: TaskAPI } = $props();

console.log(task);

const routerState = getRouterState() as EntityRouter;

const typeDisplay: Record<TaskType, string> = {
  reportedMissing: 'Reported Missing',
  newPhoto: 'New Photo',
  newFeature: 'New Feature'
};
</script>

<div class="flex flex-row items-center gap-4 text-lg">
  <Icon src={ChevronRight} class="h-6 w-6" />
  <h3 class="text-lg">
    {typeDisplay[task.type as TaskType]}
    <a
      href={`/admin/features/${task.feature?.id}`}
      onclick={(e) => goToEntity(e, routerState, 'feature', task.feature?.id)}
      class="pl-3 text-sm text-base-content/50">
      {task.feature?.title || ''}</a>
  </h3>
</div>
