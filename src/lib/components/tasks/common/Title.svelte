<script lang="ts">
// LIB
import { ADMIN_PATH } from '$lib';
import { navigateOnAdmin } from '$lib/navigation';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight } from '@steeze-ui/heroicons';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type { TaskAPI, TaskType } from '$lib/types';

let { task }: { task: TaskAPI } = $props();

const resourceState = getHierarchicalResourceState();

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
      href={`${ADMIN_PATH}/features/${task.feature?.id}`}
      onclick={(e) =>
        navigateOnAdmin(resourceState, HierarchicalResource.feature, task.feature?.id)}
      class="pl-3 text-sm text-base-content/50">
      {task.feature?.title || ''}</a>
  </h3>
</div>
