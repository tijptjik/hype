import type { PageLoad } from './$types';
import { getResponseOrError } from '$lib/api';
// ZOD Schemas
import { LayerInsertAPI } from '$lib/db/zod';

const ENDPOINT = `/api/layers/`;

export const load: PageLoad = async ({ params, fetch }) => {
  const request = await fetch(ENDPOINT);

  const layers = await getResponseOrError(request) as typeof LayerInsertAPI[];

  return { layers };
};
