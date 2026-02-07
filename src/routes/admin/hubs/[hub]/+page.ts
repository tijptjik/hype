import { loadFormData } from '$lib/api'
import { HubInsertAPI, HubUpdateAPI } from '$lib/db/zod'
// ENUMS
import { ResourcePath } from '$lib/enums'
// TYPES
import type { PageLoad } from './$types'
import type { Hub } from '$lib/types'

export const load: PageLoad = async ({ params, fetch, url }) => {
  return loadFormData<Hub>({
    entity: params.hub,
    resourcePath: ResourcePath.hub,
    insertSchema: HubInsertAPI,
    updateSchema: HubUpdateAPI,
    fetch,
    parentId: url.searchParams.get('parentId') || undefined,
    parentRef: url.searchParams.get('parentRef') || undefined,
  })
}
