import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ platform }) => {
  return {
    PUBLIC_SVELTE_QUERY_DEVTOOLS: platform?.env?.PUBLIC_SVELTE_QUERY_DEVTOOLS || 'false'
  };
}; 