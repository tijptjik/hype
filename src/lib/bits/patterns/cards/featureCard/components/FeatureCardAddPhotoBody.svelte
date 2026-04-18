<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// ICONS
import Camera from 'virtual:icons/lucide/camera'
import ImageIcon from 'virtual:icons/lucide/image'
// LOCAL
import FeatureCardAttributionField from './contribution/FeatureCardAttributionField.svelte'
import FeatureCardContributionPanel from './contribution/FeatureCardContributionPanel.svelte'

let { viewport }: { viewport: HTMLElement } = $props()

const infoItems = [
  m.photo_credit_curatorial_review(),
  m.photo_credit_initial_instruction(),
  m.photo_credit_ensure_right_to_share(),
]
</script>

<FeatureCardContributionPanel
  {viewport}
  eyebrow={m.feature_card__field_report()}
  title={m.honest_fluffy_falcon_enjoy()}
  {infoItems}
  titleIcon={Camera}
  titleIconClass="text-info"
>
  {#snippet children()}
    <FeatureCardAttributionField />
  {/snippet}
</FeatureCardContributionPanel>
