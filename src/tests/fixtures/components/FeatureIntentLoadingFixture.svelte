<script lang="ts">
// COMPONENTS
import ResourceFormSkeleton from '#lib/bits/patterns/forms/formSkeleton/ResourceFormSkeleton.svelte'
import FeatureIntentSettings from '#lib/bits/patterns/forms/featureIntent/FeatureIntentSettings.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// DOMAIN
import { DEFAULT_FEATURE_TYPES } from '#lib/features/intents.js'
setResponsiveCtx()
let phase = $state(0)
const resource = (new URLSearchParams(window.location.search).get('resource') ??
  'hub') as 'hub' | 'project' | 'layer'
/** Advance through resource, policy and loaded states without real API requests.
 * @returns Nothing.
 */
function advance(): void {
  phase++
  if (phase === 2)
    window.dispatchEvent(
      new CustomEvent('resolve-feature-policy', {
        detail: {
          types: DEFAULT_FEATURE_TYPES,
          inheritedTypes: DEFAULT_FEATURE_TYPES,
          definition: DEFAULT_FEATURE_TYPES,
          version: 1,
          fingerprint: 'fixture',
          lineage: [],
        },
      }),
    )
}
</script>
<div class="bits-theme">
  <button type="button" onclick={advance}>Resolve next</button>
  <div data-comparison>
    {#if phase === 0}
      <ResourceFormSkeleton
        {resource}
        facet="location"
        locales={['en', 'zhHant', 'zhHans']}
      />
    {:else}
      <FormSurface
        ><FeatureIntentSettings
          scopeType={resource}
          scopeId="fixture"
          disabled
        /></FormSurface
      >
    {/if}
  </div>
</div>
