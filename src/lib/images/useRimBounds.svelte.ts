// IMAGE PRESENTATION
import { getImageRimBounds } from './rimSource.js'
// TYPES
import type { ImageRimBounds } from './rims.js'

/**
 * Attaches presentation-only rim analysis to a changing image source.
 * @param getSource - Source to inspect, or null outside Cast Edges.
 * @returns Bounds scoped to the current source, with stale results discarded.
 */
export function useRimBounds(getSource: () => string | null): {
  readonly bounds: ImageRimBounds | null
} {
  let current = $state<{ src: string; bounds: ImageRimBounds | null } | null>(null)
  $effect(() => {
    const src = getSource()
    if (!src) return
    let active = true
    void getImageRimBounds(src).then(bounds => {
      if (active) current = { src, bounds }
    })
    return () => {
      active = false
    }
  })
  return {
    get bounds() {
      return current?.src === getSource() ? current.bounds : null
    },
  }
}
