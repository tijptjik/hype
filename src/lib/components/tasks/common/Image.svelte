<script lang="ts">
import Viewer from '$lib/components/common/Viewer.svelte';
import type { TaskAPI, GetImageAPI } from '$lib/types';
let { task }: { task: TaskAPI } = $props();
</script>

<div class="flex-grow">
  <Viewer image={task.image as GetImageAPI} />
</div>
