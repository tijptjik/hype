<script lang="ts">
import type { Task } from '$lib/types';

// PROPS
let {
  children,
  task,
  Right,
  Left,
  isRoundedBottom = true
}: {
  children?: any;
  task: Task;
  Right: any;
  Left: any;
  isRoundedBottom: boolean;
} = $props();

export const typeColors = {
  reportedMissing: 'border-error',
  newPhoto: 'border-info',
  newFeature: 'border-success'
};
</script>

<header
  class="mx-auto flex w-full flex-row items-center justify-between rounded-lg border-b-4 bg-base-100 px-6 py-6 {typeColors[
    task.type as keyof typeof typeColors
  ]} {isRoundedBottom ? '' : 'rounded-b-none'}">
  <div class="flex w-full items-center justify-between">
    <div class="items-left flex justify-start">
      {@render Left(task)}
    </div>
    <div class="items-right flex justify-end">
      {@render Right(task)}
    </div>
  </div>
  {@render children?.()}
</header>
