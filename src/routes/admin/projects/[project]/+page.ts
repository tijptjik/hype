import { loadFormData } from '$lib/api'
import { ProjectInsertAPI, ProjectUpdateAPI } from '$lib/db/zod'
// ENUMS
import { ResourcePath } from '$lib/enums'
// TYPES
import type { PageLoad } from './$types'
import type { Project } from '$lib/types'

export const load: PageLoad = async ({ params, fetch, url }) => {
  return loadFormData<Project>({
    entity: params.project,
    resourcePath: ResourcePath.project,
    insertSchema: ProjectInsertAPI,
    updateSchema: ProjectUpdateAPI,
    fetch,
    parentId: url.searchParams.get('parentId') || undefined,
    parentRef: url.searchParams.get('parentRef') || undefined,
  })
}
