<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

interface Props {
  onSubmit: () => void
}

let { onSubmit }: Props = $props()

const cardCtx = getCardCtx()
</script>

{#snippet submitIcon()}
  {#if cardCtx.isSubmitting}
    <span class="loading loading-ring loading-md text-current"></span>
  {/if}
{/snippet}

<FeatureCardActionButton
  text={cardCtx.isSubmitting ? m.fun_fuzzy_shrike_compose() : m.proof_active_eagle_urge()}
  icon={cardCtx.isSubmitting ? submitIcon : undefined}
  variant="primary"
  class="min-w-[8.75rem]"
  onClick={onSubmit}
  disabled={cardCtx.isSubmitting}
/>
