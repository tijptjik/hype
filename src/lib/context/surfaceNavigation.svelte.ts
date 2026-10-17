// SVELTE
import { getContext, setContext, untrack } from 'svelte'
// ENUMS
import { ResourcePath } from '#lib/enums.js'
// TYPES
import type { Id, NavigableResource } from '#lib/types.js'
import type { FacetType } from './facets.js'

/** Route projection and page-provided facet defaults for one surface. */
export class SurfaceNavigation {
  state = $state<{
    resourceType: NavigableResource | false
    resourceRef: Id | false
    facet: FacetType | false
  }>({
    resourceType: false,
    resourceRef: false,
    facet: false,
  })
  private lastLocation = ''

  /** @param resolveId Resolves a route reference using the owning surface's cache. */
  constructor(
    private readonly resolveId: (type: NavigableResource, ref: string) => Id | null = (
      _type,
      ref,
    ) => ref,
  ) {}

  /**
   * Projects a committed URL into surface navigation state, including back/forward and shallow navigation.
   * @param url Current SvelteKit page URL.
   * @param surface Route namespace owning this projection.
   * @returns Nothing.
   * @remarks Repeated URLs preserve page-supplied default facets. Queries do not reset the target.
   */
  syncUrl(url: Pick<URL, 'pathname' | 'hash'>, surface: 'admin' | 'app'): void {
    const location = `${url.pathname}${url.hash}`
    if (location === this.lastLocation) return
    this.lastLocation = location
    const parts = url.pathname.split('/').filter(Boolean)
    if (surface === 'admin') {
      if (parts.shift() !== 'admin') return
    }
    const type = Object.entries(ResourcePath).find(
      ([key, path]) => key !== 'property' && path === parts[0],
    )?.[0]
    // Standalone admin user/import pages configure their own header, without resource controls.
    const resourceType =
      type && !(surface === 'admin' && type === 'user')
        ? (type as NavigableResource)
        : false
    this.state = {
      resourceType,
      resourceRef: resourceType ? decodeURIComponent(parts[1] ?? '') || false : false,
      facet: resourceType ? (url.hash.slice(1) as FacetType) || false : false,
    }
  }

  // Active Navigation State Methods

  /**
   * Sets the active navigable resource type.
   *
   * @param resourceType - Resource type to activate, or `false` to clear it.
   * @returns Nothing.
   */
  setActiveResourceType = (resourceType: NavigableResource | false): void => {
    // Avoid redundant writes so reactive consumers do not re-run on no-op navigation changes.
    if (untrack(() => this.state.resourceType) === resourceType) return
    this.state.resourceType = resourceType
  }

  /**
   * Sets the active resource reference and optionally updates the active resource type.
   *
   * @param resourceRef - Active resource identifier, or `false` to clear it.
   * @param resourceType - Optional resource type to activate alongside the ref.
   * @returns Nothing.
   */
  setActiveResourceRef = (
    resourceRef: Id | false,
    resourceType?: NavigableResource | false,
  ): void => {
    if (resourceType !== undefined) {
      this.setActiveResourceType(resourceType)
    }
    // Skip no-op ref updates to prevent extra navigation-driven effects.
    if (untrack(() => this.state.resourceRef) === resourceRef) return
    this.state.resourceRef = resourceRef
  }

  /**
   * Sets the active facet and optionally updates the active resource ref and type first.
   *
   * @param facet - Facet to activate, or `false` to clear it.
   * @param resourceRef - Optional resource ref to set before the facet.
   * @param resourceType - Optional resource type to set before the facet.
   * @returns Nothing.
   */
  setActiveFacet = (
    facet: FacetType | false,
    resourceRef?: Id | false,
    resourceType?: NavigableResource | false,
  ): void => {
    if (resourceRef !== undefined) {
      this.setActiveResourceRef(resourceRef, resourceType)
    } else if (resourceType !== undefined) {
      this.setActiveResourceType(resourceType)
    }
    // Keep facet writes idempotent for callers that repeatedly sync URL and state.
    if (untrack(() => this.state.facet) === facet) return
    this.state.facet = facet
  }

  getActiveResourceType = (): NavigableResource | false => {
    return this.state.resourceType
  }
  getActiveResourceRef = (): Id | false => {
    return this.state.resourceRef
  }
  /** Resolves code-based route references against the surface's resource cache. @returns Resource id, or null while unresolved. */
  getActiveResourceId = (): Id | null => {
    const { resourceType, resourceRef } = this.state
    if (!resourceType || !resourceRef) return null
    return this.resolveId(resourceType, resourceRef)
  }
  getActiveFacet = (): FacetType | false => {
    return this.state.facet
  }
}

// Keep providers and consumers on the same key across development module reloads.
const NAVIGATION_CONTEXT_KEY = Symbol.for('hype.context.surface-navigation')

/** Provides navigation beside a surface's resource context. @param navigation Surface-owned navigation. @returns The supplied model. */
export function setSurfaceNavigation(navigation: SurfaceNavigation): SurfaceNavigation {
  return setContext(NAVIGATION_CONTEXT_KEY, navigation)
}

/** Resolves the enclosing surface navigation. @returns The route projection. */
export function getSurfaceNavigation(): SurfaceNavigation {
  const navigation = getContext<SurfaceNavigation | undefined>(NAVIGATION_CONTEXT_KEY)
  if (!navigation)
    throw new Error('Surface navigation is missing from this route layout')
  return navigation
}
