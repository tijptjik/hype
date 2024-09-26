import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

const ENDPOINT = `/api/projects/`;

export const load: PageLoad = async ({ params, fetch }) => {
  const request = await fetch(ENDPOINT);

  if (request.status >= 400) return error(request.status);

  const projects: Record<string, unknown> = await request.json();

  return { projects };
};
