import type { PageLoad } from './$types';
import { getResponseOrError } from '$lib/api';
// ZOD Schemas
import { FeatureInsertAPI } from '$lib/db/zod';

const ENDPOINT = `/api/features/`;

export const load: PageLoad = async ({ params, fetch }) => {
  const request = await fetch(ENDPOINT);

  const features = (await getResponseOrError(request)) as (typeof FeatureInsertAPI)[];

  return { features };
};
