<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// ICONS
import Heart from 'virtual:icons/lucide/heart'
// COMPONENTS
import FeaturePropertiesEditable from '$lib/components/featureCard/FeaturePropertiesEditable.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import FeatureCardContributionPanel from './contribution/FeatureCardContributionPanel.svelte'
import FeatureCardAttributionField from './contribution/FeatureCardAttributionField.svelte'
import FeatureCardNewAddressField from './newFeature/FeatureCardNewAddressField.svelte'
import FeatureCardNewDescriptionField from './newFeature/FeatureCardNewDescriptionField.svelte'
import FeatureCardNewTitleField from './newFeature/FeatureCardNewTitleField.svelte'

let { viewport, feature }: { viewport: HTMLElement; feature: Feature } = $props()

const infoItems = [
  m.photo_credit_curatorial_review(),
  m.photo_credit_initial_instruction(),
  m.photo_credit_ensure_right_to_share(),
]
</script>

<FeatureCardContributionPanel
  {viewport}
  eyebrow="NEW FEATURE"
  title={m.new_feature__thank_you()}
  {infoItems}
  titleIcon={Heart}
  titleIconClass="text-primary"
>
  {#snippet children()}
    <div class="grid gap-4 px-1 py-4">
      <FeatureCardNewTitleField />
      <FeatureCardNewAddressField />
      <FeatureCardNewDescriptionField />
      <FeaturePropertiesEditable {feature} />
      <div class="border-t border-white/10 pt-4"><FeatureCardAttributionField /></div>
    </div>
  {/snippet}
</FeatureCardContributionPanel>
