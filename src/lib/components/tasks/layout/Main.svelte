<script lang="ts">
import Image from '$lib/components/tasks/common/Image.svelte';
import ReportedMissing from '$lib/components/tasks/controls/ReportedMissing.svelte';
import NewFeature from '$lib/components/tasks/controls/NewFeature.svelte';
// TYPES
import type { TaskAPI } from '$lib/types';

let { task, children }: { task: TaskAPI; children: any } = $props();
</script>

<div class="flex h-full w-full flex-grow flex-row">
  {@render children(task)}
</div>
