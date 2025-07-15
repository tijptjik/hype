<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte';

let { onSubmit }: { onSubmit: () => void } = $props();

const cardCtx = getCardCtx();
</script>

<button
  class="btn btn-outline btn-primary uppercase"
  onclick={onSubmit}
  disabled={cardCtx.isSubmitting}>
  {#if cardCtx.isSubmitting}
    <span class="loading loading-ring loading-md"></span>
    {m.fun_fuzzy_shrike_compose()}
  {:else}
    {m.proof_active_eagle_urge()}
  {/if}
</button>
