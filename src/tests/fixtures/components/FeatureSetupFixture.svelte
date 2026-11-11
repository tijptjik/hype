<script lang="ts">
import FeatureSetup from '#lib/bits/patterns/forms/featureSetup/FeatureSetup.svelte'
import type {
  FeatureSetupResults,
  FeatureSetupScope,
} from '#lib/bits/patterns/forms/featureSetup/featureSetup.types.js'
import { DEFAULT_FEATURE_TYPES } from '#lib/features/intents.js'
import type { FeatureType } from '#lib/features/intents.js'
import type { TargetContext } from '#lib/features/locationPolicy.js'
import type { ParentSectionLayerItem } from '#lib/bits/patterns/forms/formParentSection/formParentSection.types.js'
const catalogue: FeatureSetupResults = {
  organisations: [
    {
      id: 'org',
      code: 'CMEF',
      i18n: { en: { name: 'Cultural Foundation', nameShort: 'CMEF' } },
    },
  ],
  projects: [
    {
      id: 'project',
      organisationId: 'org',
      code: 'books',
      i18n: { en: { name: 'Independent Bookstores' } },
    },
  ],
  layers: [
    {
      id: 'layer',
      projectId: 'project',
      organisationId: 'org',
      code: 'open',
      i18n: { en: { name: 'Open bookstores' } },
    },
    {
      id: 'closed',
      projectId: 'project',
      organisationId: 'org',
      code: 'closed',
      i18n: { en: { name: 'Permanently Closed' } },
    },
  ],
}
let layer = $state<ParentSectionLayerItem | null>(catalogue.layers[0])
let type = $state<FeatureType | null>(DEFAULT_FEATURE_TYPES[0])
let context = $state<TargetContext | null>('building_part')
let step = $state(0)
let searching = $state(false)
let loadCount = $state(0)
let searchCount = $state(0)
async function load(
  query: string,
  scope: FeatureSetupScope,
): Promise<FeatureSetupResults> {
  loadCount++
  await new Promise(resolve => setTimeout(resolve, 350))
  return {
    ...catalogue,
    layers: (location.search.includes('single-all')
      ? catalogue.layers.slice(0, 1)
      : catalogue.layers
    ).filter(
      item =>
        (!scope.projectId || scope.projectId === item.projectId) &&
        (!query || item.i18n?.en?.name?.toLowerCase().includes(query.toLowerCase())),
    ),
  }
}
</script>
<main
  data-load-count={loadCount}
  data-search-count={searchCount}
  class="flex h-dvh min-h-0 min-w-0 flex-col"
>
  <FeatureSetup
    initialLayerId={location.search.includes('linked') ? 'layer' : undefined}
    initialScope={{
      organisationId: location.search.includes('organisation') ? 'org' : undefined,
      projectId: location.search.includes('project') ? 'project' : undefined,
    }}
    bind:step
    {layer}
    sourceLayerId={layer?.id}
    {type}
    {context}
    contexts={type?.targetContexts ?? []}
    {load}
    onLayer={value => (layer = value)}
    onType={value => (type = value)}
    onContext={value => (context = value)}
    onSearch={() => {
      searching = true
      searchCount++
    }}
  />
  {#if step === 3 && searching}
    <p data-search-target>Searching for {context}</p>
  {/if}
</main>
