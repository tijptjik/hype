import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ platform, locals }) => {
  return {
    PUBLIC_SVELTE_QUERY_DEVTOOLS:
      platform?.env?.PUBLIC_SVELTE_QUERY_DEVTOOLS || 'false',
    hub: locals.hub
  };
};
