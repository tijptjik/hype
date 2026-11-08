<script lang="ts">
// COMPONENTS
import FeaturePublicationHistory from '#lib/bits/patterns/revisionHistory/FeaturePublicationHistory.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// FIXTURES
import { featureRevisionContentFixture } from '../featureRevisionContent'
setResponsiveCtx()
const property = featureRevisionContentFixture().properties.choice
property.selection.definition.labels = { en: { value: 'Material', generated: false } }
property.selection.definition.selectedOption = {
  id: 'opaque-option',
  value: 'Glass',
  translations: {},
}
property.selection.propertyValueId = 'opaque-option'
property.selection.value = ''
property.selection.valueJson = null
property.translations = {}
const entries = [
  {
    generation: 1,
    revisionId: 'revision',
    actorId: 'editor',
    actorName: 'Project owner',
    origin: 'user',
    reason:
      'Feature moved from Ghost Signs › HKGS › Current to Archive › Signs › Historic',
    transfer: {
      from: ['Ghost Signs', 'HKGS', 'Current'],
      to: ['Archive', 'Signs', 'Historic'],
    },
    createdAt: '2026-11-09T02:00:00Z',
  },
]
</script>
<main class="bg-panel text-foreground mx-auto min-h-screen max-w-6xl py-6">
  <FeaturePublicationHistory
    {entries}
    canReview
    loadReview={async () => ({
      changes: [
        {
          path: ['properties', 'opaque-property'],
          before: { present: true, value: property },
          after: { present: false },
        },
      ],
      redacted: false,
    })}
  />
</main>
