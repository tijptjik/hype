import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  const organisationCode = params.organisation;
  const endPoint = `/api/organisations/${organisationCode}/form`;

  const request = await fetch(endPoint);
  if (request.status >= 400) return error(request.status);

  const form = await request.json();
  return { form };
};
