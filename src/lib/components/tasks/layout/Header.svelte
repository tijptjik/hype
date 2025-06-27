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
  class="relative mb-4 flex h-14 w-full flex-row items-center justify-between gap-4 rounded-2xl bg-transparent pl-1 @container">
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
