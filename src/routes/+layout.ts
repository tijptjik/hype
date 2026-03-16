import { browser } from '$app/environment'
import { getLocaleKey } from '$lib/i18n'
import { QueryClient } from '@tanstack/svelte-query'
// TYPES
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'

export const ssr = false
export const prerender = false
// See https://khromov.se/the-missing-guide-to-understanding-adapter-static-in-sveltekit/
export const trailingSlash = 'never'

export async function load({ data }) {
  const hub = data.hub as HubOptsExtended
  const localeKey = getLocaleKey()
  const localizedHubI18n = hub.i18n?.[localeKey]
  const fallbackHubI18n = hub.i18n?.en ?? Object.values(hub.i18n ?? {})[0]

  /**
   * @deprecated Remove once we have fully moved to svelte remote functions
   */
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
    hub,
    title: localizedHubI18n?.name ?? fallbackHubI18n?.name ?? '',
    site_name: localizedHubI18n?.name ?? fallbackHubI18n?.name ?? '',
    site_description:
      localizedHubI18n?.description ?? fallbackHubI18n?.description ?? '',
  }
}
