import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageLoad, RouteParams } from './$types';
// ZOD Schemas
import { OrganisationReqBody } from '$lib/db/zod';

export const load: PageLoad = async ({
  params,
  fetch
}: {
  params: RouteParams;
  fetch: typeof globalThis.fetch;
}) => {
  const organisationCode = params.organisation;
  let form;
  if (organisationCode === 'new') {
    form = await superValidate(zod(OrganisationReqBody));
  } else {
    const endPoint = `/api/organisations/${organisationCode}`;

    const request = await fetch(endPoint);
    if (request.status >= 400) return error(request.status);

    const formData: Record<string, unknown> = await request.json();

    form = await superValidate(formData, zod(OrganisationReqBody));
  }

  return { form };
};
