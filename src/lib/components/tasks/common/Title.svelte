<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight } from '@steeze-ui/heroicons';
// TYPES
import type { TaskAPI, TaskType } from '$lib/types';

let { task }: { task: TaskAPI } = $props();

console.log(task);

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
    <small class="pl-3 text-sm text-base-content/50"
      ><span class="font-normal"></span> {task.feature?.title || ''}</small>
  </h3>
</div>
