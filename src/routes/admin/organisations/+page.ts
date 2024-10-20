import type { PageLoad } from './$types';
import { getResponseOrError } from '$lib/api';
// ZOD Schemas
import { OrganisationReqBody } from '$lib/db/zod';


const ENDPOINT = `/api/organisations/`;

export const load: PageLoad = async ({ params, fetch }) => {
  const request = await fetch(ENDPOINT);

  const organisations = await getResponseOrError(request) as typeof OrganisationReqBody[];

  return { organisations };
};
