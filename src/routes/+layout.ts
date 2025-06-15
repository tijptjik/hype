import { browser } from '$app/environment';
import { QueryClient } from '@tanstack/svelte-query';

export const ssr = false;
export const prerender = false;
// See https://khromov.se/the-missing-guide-to-understanding-adapter-static-in-sveltekit/
export const trailingSlash = 'never';

export async function load({ data }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false
      }
    }
  });

  return { 
    queryClient,
    PUBLIC_SVELTE_QUERY_DEVTOOLS: data.PUBLIC_SVELTE_QUERY_DEVTOOLS
  };
}
