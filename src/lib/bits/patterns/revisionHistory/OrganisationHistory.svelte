<script lang="ts">
// COMPONENTS
import ResourceHistory from './ResourceHistory.svelte'
// API
import { getOrganisationHistory } from '#lib/api/organisationHistory.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// TYPES
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'

let { organisationId }: { organisationId: string } = $props()
/**
 * Loads the existing organisation history categories through the shared viewer.
 * @param before Optional continuation cursor.
 * @param kind Profile or field-definition history.
 * @returns A freshly authorized history page.
 */
async function loadPage(
  before?: number,
  kind?: 'profile' | 'fields',
): Promise<OrganisationHistoryPage> {
  return await refreshRemoteQuery(
    getOrganisationHistory({
      organisationId,
      before,
      ...(kind === 'fields' ? { kind } : {}),
    }),
  )
}
</script>

<ResourceHistory
  resourceId={organisationId}
  resourceLabel="organisation"
  {loadPage}
  showFields
/>
