<script lang="ts">
// COMPONENTS
import FormResetButton from '$lib/components/menu/buttons/FormResetButton.svelte';
import FormSubmitButton from '$lib/components/menu/buttons/FormSubmitButton.svelte';
import ArchiveButton from '$lib/components/menu/buttons/ArchiveButton.svelte';
import PublishButton from '$lib/components/menu/buttons/PublishButton.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';

// STATE : CONTEXT
const appCtx = getAppCtx();

// STATE : DERIVED
let formCtx = $derived(appCtx.formCtx);
</script>

{#if formCtx}
  <div class="flex flex-row space-x-2">
    <FormResetButton form={formCtx} />
    <FormSubmitButton form={formCtx} />
    <ArchiveButton form={formCtx} />
    <PublishButton form={formCtx} />
  </div>
{/if}
