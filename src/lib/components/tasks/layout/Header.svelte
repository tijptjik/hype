<script lang="ts">
import Title from '$lib/components/tasks/common/Title.svelte';
import type { TaskAPI } from '$lib/types';

// PROPS
let { task, Right, Left, isRoundedBottom = true }: { task: TaskAPI, Right: any, Left: any, isRoundedBottom: boolean } = $props();

export const typeColors = {
  reportedMissing: 'border-error',
  newPhoto: 'border-info',
  newFeature: 'border-success'
};
</script>

<header
  class="mx-auto flex w-full flex-row items-center justify-between rounded-lg border-b-4 bg-base-100 px-6 py-6 {typeColors[task.type]} {isRoundedBottom ? '' : 'rounded-b-none'}">
  <div class="flex items-center justify-between w-full">
    <div class="flex items-left justify-start w-full">
      {@render Left(task)}
    </div>
    <div class="flex items-right justify-end w-full">
      {@render Right(task)}
    </div>
  </div>
</header>
