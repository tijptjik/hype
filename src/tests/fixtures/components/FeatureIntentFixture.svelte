<script lang="ts">
import FeatureIntentSettings from '#lib/bits/patterns/forms/featureIntent/FeatureIntentSettings.svelte'
import FeatureIntentChoice from '#lib/bits/patterns/forms/featureIntent/FeatureIntentChoice.svelte'
import type { FeatureType } from '#lib/features/intents.js'
let layerId = $state('mixed')
let selected = $state<FeatureType | null>(null)
</script>
<main class="mx-auto grid max-w-4xl gap-8 p-4">
  <button
    type="button"
    onclick={() => (layerId = layerId === 'mixed' ? 'signs' : 'mixed')}
  >
    Switch layer
  </button>
  <FeatureIntentChoice
    {layerId}
    value={selected?.id}
    onChange={type => (selected = type)}
  />
  <p data-selected>{selected?.id ?? 'none'}</p>
  <FeatureIntentSettings scopeType="project" scopeId="project" />
</main>
