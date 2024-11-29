<script lang="ts">
import type { TaskAPI } from '$lib/types';

type Props = {
  task: TaskAPI;
  children: any;
};

let { task, children }: Props = $props();

export const typeColors = {
  reportedMissing: 'border-error',
  newPhoto: 'border-info',
  newFeature: 'border-success'
};
</script>

<div class="flex h-full w-full flex-col rounded-xl border-b-4 {typeColors[task.type]}">
  {@render children({ task })}
</div>
