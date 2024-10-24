import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageLoad, RouteParams } from './$types';
// ZOD Schemas
import { FeatureInsertAPI, FeatureUpdateAPI } from '$lib/db/zod';

export const load: PageLoad = async ({
  params,
  fetch,
}: {
  params: RouteParams;
  fetch: typeof globalThis.fetch;
}) => {
  const entity = params.feature || 'new';
  let form;
  if (entity === 'new') {
    form = await superValidate(zod(FeatureInsertAPI));
  } else {
    const endPoint = `/api/features/${entity}`;

    const request = await fetch(endPoint);
    if (request.status >= 400) return error(request.status);

    const formData: Record<string, unknown> = await request.json();

    form = await superValidate(formData, zod(FeatureUpdateAPI));
  }

  return { entity, form };
};
