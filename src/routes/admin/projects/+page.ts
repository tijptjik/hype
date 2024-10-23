import type { PageLoad } from './$types';
import { getResponseOrError } from '$lib/api';
// ZOD Schemas
import { ProjectInsertAPI  } from '$lib/db/zod';

const ENDPOINT = `/api/projects/`;

export const load: PageLoad = async ({ params, fetch }) => {
  const request = await fetch(ENDPOINT);

  const projects = await getResponseOrError(request) as typeof ProjectInsertAPI[];

  return { projects };
};
