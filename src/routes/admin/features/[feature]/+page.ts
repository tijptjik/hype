import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { FeatureSchema } from '$lib/db/schema';
import { zod } from 'sveltekit-superforms/adapters';

export const load: PageLoad = async ({ params, fetch }) => {
  const featureId = params.feature;
  const endPoint = `/api/features/${featureId}`;

  const request = await fetch(endPoint);
  if (request.status >= 400) error(request.status);

  const formData: Record<string, unknown> = await request.json();
  const form = await superValidate(formData, zod(FeatureSchema));

  return { form };
};
