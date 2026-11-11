<script lang="ts">
// COMPONENTS
import HistorySkeleton from '#lib/bits/patterns/revisionHistory/HistorySkeleton.svelte'
import ResourceHistory from '#lib/bits/patterns/revisionHistory/ResourceHistory.svelte'
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'
let stage = $state('module')
let resolvePage: ((page: OrganisationHistoryPage) => void) | undefined
const data: OrganisationHistoryPage = {
  available: true,
  nextCursor: null,
  entries: [
    {
      id: 'revision',
      actorId: 'actor',
      actor: null,
      origin: 'user',
      reason: 'Profile and settings updated',
      createdAt: '2026-11-11T02:00:00Z',
      initial: false,
      changes: [
        {
          path: ['translations', 'zh-hant', 'description'],
          before: { present: true, value: 'Previous description' },
          after: { present: true, value: 'Updated description' },
        },
        {
          path: ['translations', 'zh-hans', 'descriptionGen'],
          before: { present: true, value: true },
          after: { present: true, value: false },
        },
      ],
    },
  ],
}
/** Hold the data stage until the browser explicitly releases it. @returns The fixture history page. */
function loadPage(): Promise<OrganisationHistoryPage> {
  return new Promise(resolve => {
    resolvePage = resolve
  })
}
</script>
<div class="bits-theme">
  <div class="flex h-12 gap-4">
    <button type="button" onclick={() => (stage = 'data')}>Load module</button>
    <button type="button" onclick={() => resolvePage?.(data)}>Load records</button>
  </div>
  <div data-history class="bg-panel text-foreground">
    {#if stage === 'module'}
      <HistorySkeleton />
    {:else}
      <ResourceHistory resourceId="fixture" resourceLabel="hub" showFields {loadPage} />
    {/if}
  </div>
</div>
