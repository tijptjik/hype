import { loadFormData } from '$lib/api';
import { ProjectInsertAPI, ProjectUpdateAPI } from '$lib/db/zod';
import type { PageLoad } from './$types';
import type { Project } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
  return loadFormData<Project>({
    entity: params.project,
    resourcePath: 'projects',
    insertSchema: ProjectInsertAPI,
    updateSchema: ProjectUpdateAPI,
    fetch
  });
};
