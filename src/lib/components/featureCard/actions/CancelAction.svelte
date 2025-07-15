<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte';
// ENUMS
import { FeatureCardMode } from '$lib/enums';

// CONTEXT
const cardCtx = getCardCtx();
</script>

<button
  class="btn btn-outline border-base-100 uppercase hover:bg-base-200 hover:text-base-content"
  onclick={() => (cardCtx.state.mode = FeatureCardMode.Display)}>
  {m.cancel()}
</button>
