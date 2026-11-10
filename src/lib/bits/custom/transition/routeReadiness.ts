// SVELTE
import { getContext, onDestroy } from 'svelte'

export const ROUTE_READINESS = Symbol('route-readiness')

export type RouteReadiness = {
  registerPending: () => () => void
}

/**
 * Holds the previous route's visual snapshot while an initial resource loader exists.
 * @returns Nothing.
 * @remarks Optional outside an admin route viewport; pagination does not register.
 */
export function holdRouteWhileLoading(): void {
  const readiness = getContext<RouteReadiness | undefined>(ROUTE_READINESS)
  if (readiness) onDestroy(readiness.registerPending())
}
