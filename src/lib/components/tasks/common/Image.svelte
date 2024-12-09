<script lang="ts">
// LIB
import type { TaskAPI, GetImageAPI } from '$lib/types';
// CONTEXT
import { imageSets } from '$lib/images/index.svelte';
// COMPONENTS
import Viewer from '$lib/components/common/Viewer.svelte';

let { task }: { task: TaskAPI } = $props();
</script>

<div class="flex-shrink-0 flex-grow bg-base-100">
  <Viewer
    image={imageSets.activeImage as GetImageAPI}
    enableDropzone={true}
    resource="feature"
    entityId={task.featureId} />
</div>
