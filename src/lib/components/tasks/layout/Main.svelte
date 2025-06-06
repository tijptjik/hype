<script lang="ts">
// TYPES
import type { Task } from '$lib/types';

let { task, children }: { task: Task; children: any } = $props();
</script>

<div class="flex h-full w-full flex-grow flex-row">
  {@render children(task)}
</div>
