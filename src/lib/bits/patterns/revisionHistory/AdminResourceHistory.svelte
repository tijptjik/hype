<script lang="ts">
// COMPONENTS
import ResourceHistory from './ResourceHistory.svelte'
// API
import { getAdminResourceHistory } from '#lib/api/adminResourceHistory.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// TYPES
import type { AdminRevisionResource } from '#lib/db/services/resourceHistory.js'
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'

let { resource, resourceId }: { resource: AdminRevisionResource; resourceId: string } =
  $props()
/**
 * Loads profile evidence using the resource's current editor authorization.
 * @param before Optional continuation cursor.
 * @param kind Profile evidence or owned field definitions.
 * @returns Fresh attributed history, including migration availability.
 */
async function loadPage(
  before?: number,
  kind?: 'profile' | 'fields',
): Promise<OrganisationHistoryPage> {
  return await refreshRemoteQuery(
    getAdminResourceHistory({
      resource,
      id: resourceId,
      before,
      ...(kind === 'fields' ? { kind } : {}),
    }),
  )
}
</script>

{#key resource}
  <ResourceHistory
    {resourceId}
    resourceLabel={resource}
    {loadPage}
    showFields={resource !== 'layer'}
  />
{/key}
