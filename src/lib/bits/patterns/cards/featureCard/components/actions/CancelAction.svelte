<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

const cardCtx = getCardCtx()
</script>

<FeatureCardActionButton
  text={m.cancel()}
  variant="ghost"
  class="w-auto min-w-[7rem] px-[calc(var(--btn-padding-x)-0.25rem)]"
  onClick={() => {
    cardCtx.state.mode = FeatureCardMode.Display
  }}
/>
