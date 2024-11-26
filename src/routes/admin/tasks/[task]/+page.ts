import { loadFormData } from '$lib/api';
import { TaskInsertAPI, TaskUpdateAPI } from '$lib/db/zod';
import type { PageLoad } from './$types';
import type { Task } from '$lib/types';

export const load: PageLoad = async ({ params, fetch, data }) => {
  return loadFormData<Task>({
    entity: params.task,
    resourcePath: 'tasks',
    insertSchema: TaskInsertAPI,
    updateSchema: TaskUpdateAPI,
    fetch
  });
}