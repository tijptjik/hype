import { loadData } from '$lib/api';
import type { PageLoad } from './$types';
import type { Task } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
  return loadData<Task>({
    entity: params.task,
    resourcePath: 'tasks',
    fetch,
    dataKey: 'task'
  });
}