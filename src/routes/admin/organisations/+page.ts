import type { PageLoad } from './$types';
import { OrganisationSchema } from '$lib/db/schema';
import { getResponseOrError } from '$lib/api';

const ENDPOINT = `/api/organisations/`;

export const load: PageLoad = async ({ params, fetch }) => {
  const request = await fetch(ENDPOINT);

  const organisations = await getResponseOrError(request) as typeof OrganisationSchema[];

  return { organisations };
};
