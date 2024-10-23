import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageLoad, RouteParams } from './$types';
// ZOD Schemas
import { ProjectInsertAPI, ProjectUpdateAPI } from '$lib/db/zod';

export const load: PageLoad = async ({
  params,
  fetch,
}: {
  params: RouteParams;
  fetch: typeof globalThis.fetch;
}) => {
  const entity = params.project || 'new';
  let form;
  if (entity === 'new') {
    form = await superValidate(zod(ProjectInsertAPI));
  } else {
    const endPoint = `/api/projects/${entity}`;

    const request = await fetch(endPoint);
    if (request.status >= 400) return error(request.status);

    const formData: Record<string, unknown> = await request.json();

    form = await superValidate(formData, zod(ProjectUpdateAPI));
  }

  return { entity, form };
};
