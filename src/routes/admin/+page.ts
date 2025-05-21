// SVELTE
import { redirect } from '@sveltejs/kit';
// LIB
import { ADMIN_PATH } from '$lib/index';
// ENUMS
import { HierarchicalResource, HierarchicalResourcePath } from '$lib/enums';

const DEFAULT_RESOURCE = HierarchicalResource.organisation;

export function load() {
  const resourcePath = HierarchicalResourcePath[DEFAULT_RESOURCE];
  return redirect(307, `${ADMIN_PATH}/${resourcePath}`);
}
