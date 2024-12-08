<script lang="ts">
// TYPES
import type { TaskAPI } from '$lib/types';

let { task, children }: { task: TaskAPI; children: any } = $props();
</script>

<div class="flex h-full w-full flex-grow flex-row">
  {@render children(task)}
</div>
