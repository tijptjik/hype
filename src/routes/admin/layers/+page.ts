import type { PageLoad } from './$types';
import { LayerSchema } from '$lib/db/schema';
import { getResponseOrError } from '$lib/api';

const ENDPOINT = `/api/layers/`;

export const load: PageLoad = async ({ params, fetch }) => {
  const request = await fetch(ENDPOINT);

  const layers = await getResponseOrError(request) as typeof LayerSchema[];

  return { layers };
};
