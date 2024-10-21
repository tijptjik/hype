import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageLoad, RouteParams } from './$types';
// ZOD Schemas
import { OrganisationReqBody } from '$lib/db/zod';

export const load: PageLoad = async ({
  params,
  fetch,
  url
}: {
  params: RouteParams;
  fetch: typeof globalThis.fetch;
  url: URL;
}) => {
  const entity = params.organisation || 'new';
  let form;
  if (entity === 'new') {
    form = await superValidate(zod(OrganisationReqBody));
  } else {
    const endPoint = `/api/organisations/${entity}`;

    const request = await fetch(endPoint);
    if (request.status >= 400) return error(request.status);

    const formData: Record<string, unknown> = await request.json();

    form = await superValidate(formData, zod(OrganisationReqBody));
  }

  return { entity, form };
};
