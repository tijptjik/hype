import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { OrganisationSchema } from '$lib/db/schema';
import { zod } from 'sveltekit-superforms/adapters';

const ENDPOINT = `/api/organisations/`;

export const load: PageLoad = async ({ params, fetch }) => {

  const request = await fetch(ENDPOINT);

  if (request.status >= 400) return error(request.status);

  const organisations: Record<string, unknown> = await request.json();


  return { organisations };
};
