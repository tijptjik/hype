import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageLoad, RouteParams } from './$types';
// ZOD Schemas
import { LayerInsertAPI, LayerUpdateAPI } from '$lib/db/zod';

export const load: PageLoad = async ({
  params,
  fetch,
}: {
  params: RouteParams;
  fetch: typeof globalThis.fetch;
}) => {
  const entity = params.layer || 'new';
  let form;
  if (entity === 'new') {
    form = await superValidate(zod(LayerInsertAPI));
  } else {
    const endPoint = `/api/layers/${entity}`;

    const request = await fetch(endPoint);
    if (request.status >= 400) return error(request.status);

    const formData: Record<string, unknown> = await request.json();

    form = await superValidate(formData, zod(LayerUpdateAPI));
  }

  return { entity, form };
};
