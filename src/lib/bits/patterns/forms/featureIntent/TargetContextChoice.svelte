<script lang="ts">
// I18N
import * as m from '#lib/paraglide/messages.js'
// COMPONENTS
import IntentChoiceCard from './IntentChoiceCard.svelte'
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
// TAXONOMY
import { LOCATION_ENTITY_KINDS, locationTaxonomy } from '#lib/locations/taxonomy.js'
import { locationTaxonomyLabel } from '#lib/locations/taxonomy.i18n.js'
// DOMAIN
import { targetContextChoices } from './targetContextChoices'
import {
  targetContextLabel,
  targetContextExamples,
} from '#lib/features/locationPolicy.i18n.js'
import type { TargetContext } from '#lib/features/locationPolicy.js'
let {
  contexts,
  value,
  onChange,
}: {
  contexts: readonly TargetContext[]
  value?: TargetContext | null
  onChange: (context: TargetContext) => void
} = $props()
const effectiveContexts = $derived(targetContextChoices(contexts))
</script>
<fieldset class="mb-8 grid min-w-0 gap-3">
  <legend class="mb-3 text-lg font-semibold">
    {m.setup_feature_location_question()}
  </legend>
  {#each LOCATION_ENTITY_KINDS as family}
    {@const options = effectiveContexts.filter(
      context => locationTaxonomy(context).kind === family,
    )}
    {#if options.length}
      <h3 class="mt-4 font-semibold">{locationTaxonomyLabel(family)}</h3>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
        {#each options as context (context)}
          <IntentChoiceCard
            label={targetContextLabel(context)}
            description={targetContextExamples(context)}
            selected={value === context ||
              (value === 'infrastructure' && context === 'built')}
            onclick={() => onChange(context)}
          >
            {#snippet icon()}
              <LocationIcon kind={context} class="size-7" />
            {/snippet}
          </IntentChoiceCard>
        {/each}
      </div>
    {/if}
  {/each}
</fieldset>
