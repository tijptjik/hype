<script lang="ts">
// COMPONENTS
import FeaturePublicationHistory from '#lib/bits/patterns/revisionHistory/FeaturePublicationHistory.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
setResponsiveCtx()
const entries = [
  {
    generation: 2,
    revisionId: 'revision',
    actorId: 'history.editor',
    origin: 'user',
    reason: 'Corrected the English name and description',
    createdAt: '2026-11-06T10:00:00Z',
  },
  {
    generation: 1,
    revisionId: null,
    actorId: 'system',
    origin: 'migration',
    reason: 'Development example copied from the original feature',
    createdAt: '2026-11-06T09:00:00Z',
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
          path: ['translations', 'en', 'title'],
          before: { present: true, value: 'Tung Kung — first sign' },
          after: {
            present: true,
            value:
              'Tung Kung — restored historical street sign with its full descriptive name',
          },
        },
      ],
      redacted: true,
    })}
  />
</main>
