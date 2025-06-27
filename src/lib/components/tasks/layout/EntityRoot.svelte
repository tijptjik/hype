<script lang="ts">
// ENUMS
import { TaskType } from '$lib/enums';
// TYPES
import type { Task } from '$lib/types';

type Props = {
  task: Task;
  children: any;
};

let { task, children }: Props = $props();

export const typeColors: Record<TaskType, string> = {
  reportedMissing: 'border-error',
  newPhoto: 'border-info',
  newFeature: 'border-success'
};
</script>

<div class="flex h-full w-full flex-col overflow-hidden rounded-xl">
  {@render children({ task })}
</div>
