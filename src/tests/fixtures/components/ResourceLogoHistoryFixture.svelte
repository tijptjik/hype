<script lang="ts">
import ResourceHistory from '#lib/bits/patterns/revisionHistory/ResourceHistory.svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'
setResponsiveCtx()
/** Supplies a legacy baseline and exact logo change without mutating app data.
 * @returns Synthetic history for rendered verification.
 */
async function loadPage(): Promise<OrganisationHistoryPage> {
  return {
    available: true,
    nextCursor: null,
    entries: [
      {
        id: 'edit',
        actorId: 'editor',
        actor: null,
        origin: 'user',
        reason: 'Logo metadata updated',
        createdAt: '2026-11-06T08:00:00Z',
        initial: false,
        logo: {
          before: { imageId: 'logo', imageRevisionId: 'old' },
          after: { imageId: 'logo', imageRevisionId: 'new' },
        },
        changes: [
          {
            path: ['logo', 'rotation'],
            before: { present: true, value: 0 },
            after: { present: true, value: 90 },
          },
          {
            path: ['logo', 'presentationMode'],
            before: { present: true, value: 'cover' },
            after: { present: true, value: 'cast-edges' },
          },
          {
            path: ['logo', 'imageRevisionId'],
            before: { present: true, value: 'old' },
            after: { present: true, value: 'new' },
          },
        ],
      },
      {
        id: 'legacy',
        actorId: 'system:baseline',
        actor: null,
        origin: 'migration',
        reason: 'Initial recorded state',
        createdAt: '2026-11-05T08:00:00Z',
        initial: true,
        logo: { before: null, after: { imageId: 'logo', imageRevisionId: null } },
        changes: [],
      },
    ],
  }
}
</script>
<div class="mx-auto max-w-3xl p-4">
  <ResourceHistory resourceId="fixture" resourceLabel="Project" {loadPage} />
</div>
