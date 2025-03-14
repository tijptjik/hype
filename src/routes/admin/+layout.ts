import { browser } from '$app/environment';
import { QueryClient } from '@tanstack/svelte-query';

export async function load() {
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

  return { queryClient };
}
