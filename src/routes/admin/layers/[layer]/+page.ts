import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { LayerSchema } from '$lib/db/schema';
import { zod } from 'sveltekit-superforms/adapters';

export const load: PageLoad = async ({ params, fetch }) => {
  const layerId = params.layer;
  const endPoint = `/api/layers/${layerId}`;

  const request = await fetch(endPoint);
  if (request.status >= 400) return error(request.status);

  const formData: Record<string, unknown> = await request.json();
  const form = await superValidate(formData, zod(LayerSchema));

  return { form };
};
