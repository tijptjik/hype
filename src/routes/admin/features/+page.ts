import type { PageLoad } from './$types';
import { FeatureSchema } from '$lib/db/schema';
import { getResponseOrError } from '$lib/api';

const ENDPOINT = `/api/features/`;

export const load: PageLoad = async ({ params, fetch }) => {
  const request = await fetch(ENDPOINT);

  const features = await getResponseOrError(request) as typeof FeatureSchema[];
  return { features };
};