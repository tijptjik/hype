<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
// ICONS
import TriangleAlert from 'virtual:icons/lucide/triangle-alert'
// LOCAL
import FeatureCardContributionPanel from './contribution/FeatureCardContributionPanel.svelte'

let { viewport }: { viewport: HTMLElement } = $props()

const cardCtx = getCardCtx()
const infoItems = [
  m.report_missing__curatorial_review(),
  m.report_missing__initial_instruction(),
  m.report_missing__add_photo_instructions(),
]
</script>

<FeatureCardContributionPanel
  {viewport}
  eyebrow={m.feature_card__field_report()}
  title={m.such_that_rabbit_pull()}
  helperText={m.feature_card__add_photo_evidence_note()}
  {infoItems}
  titleIcon={TriangleAlert}
  titleIconClass="text-error"
>
  {#snippet children()}
    <textarea
      id="missing-reason"
      bind:value={cardCtx.userData.missingReason}
      class="min-h-18 w-full rounded-none border border-white/14 bg-black/35 px-4 py-2 text-sm leading-6 text-white caret-white placeholder:text-white/34 focus:border-white/28 focus:outline-none"
      rows="3"
      placeholder={m.report_missing__placeholder()}
    ></textarea>
  {/snippet}
</FeatureCardContributionPanel>
