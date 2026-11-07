// SVELTE
import { goto } from '$app/navigation'
import { page } from '$app/state'

/**
 * Keeps user tabs synchronized with deep links and browser history.
 * @param getFacets Returns the currently available tabs, including permission changes.
 * @returns The active tab and a shallow navigation command.
 * @remarks Shallow navigation preserves unsaved drafts and existing query parameters.
 */
export function createUserFacetNavigation(
  getFacets: () => ReadonlyMap<string, unknown>,
): { readonly active: string; select: (facet: string) => void } {
  const currentUrl = $derived(page.shallow?.url ?? page.url)
  const active = $derived(
    getFacets().has(currentUrl.hash.slice(1)) ? currentUrl.hash.slice(1) : 'profile',
  )

  return {
    get active() {
      return active
    },
    select(facet: string): void {
      if (!getFacets().has(facet)) return
      const url = new URL(currentUrl.href)
      url.hash = facet
      if (url.href === currentUrl.href) return
      void goto(url.toString(), { shallow: true })
    },
  }
}
