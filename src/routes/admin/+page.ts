// SVELTE
import { redirect } from '@sveltejs/kit';
// LIB
import { ADMIN_PATH } from '$lib/index';
// ENUMS
import { FirstClassResource, ResourcePath } from '$lib/enums';

const DEFAULT_RESOURCE = FirstClassResource.organisation;

export function load() {
  const resourcePath = ResourcePath[DEFAULT_RESOURCE];
  return redirect(307, `${ADMIN_PATH}/${resourcePath}`);
}
