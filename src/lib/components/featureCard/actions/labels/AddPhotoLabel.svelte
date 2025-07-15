<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte';

// CONTEXT
const imageCtx = getImageCtx();
</script>

<h3 class="text-lg font-bold uppercase text-base-100">
  {@html imageCtx.state.stagingQueue.length > 0
    ? `<span class="text-white px-2">${imageCtx.state.stagingQueue.length}</span> ${m.photo({ n: imageCtx.state.stagingQueue.length })}`
    : 'Add Photos'}
</h3>
