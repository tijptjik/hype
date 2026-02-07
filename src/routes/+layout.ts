import { browser } from '$app/environment'
import { getLocale } from '$lib/i18n'
import { QueryClient } from '@tanstack/svelte-query'
// TYPES
import type { HubOpts } from '$lib/types'

export const ssr = false
export const prerender = false
// See https://khromov.se/the-missing-guide-to-understanding-adapter-static-in-sveltekit/
export const trailingSlash = 'never'

export async function load({ data }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchOnReconnect: true,
      },
    },
  })

  return {
    queryClient,
    PUBLIC_SVELTE_QUERY_DEVTOOLS: data.PUBLIC_SVELTE_QUERY_DEVTOOLS,
    hub: data.hub as HubOpts,
    title:
      (data.hub as HubOpts).i18n?.[getLocale()]?.name ??
      (data.hub as HubOpts).i18n?.en.name,
    site_name:
      (data.hub as HubOpts).i18n?.[getLocale()]?.name ??
      (data.hub as HubOpts).i18n?.en.name,
    site_description:
      (data.hub as HubOpts).i18n?.[getLocale()]?.description ??
      (data.hub as HubOpts).i18n?.en.description,
  }
}
