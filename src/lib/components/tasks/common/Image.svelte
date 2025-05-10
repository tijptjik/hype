<script lang="ts">
// COMPONENTS
import Viewer from '$lib/components/common/Viewer.svelte';

let { isDropzone = true }: { isDropzone?: boolean } = $props();
</script>

<div class="flex-shrink-0 flex-grow bg-base-100">
  <Viewer {isDropzone} />
</div>
