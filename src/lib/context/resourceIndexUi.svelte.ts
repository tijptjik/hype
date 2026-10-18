// TYPES
import type { NavigableResource } from '#lib/types.js'

export type LayoutMode = 'table' | 'list' | 'card'

/** Per-resource presentation preferences for one admin surface. */
export class ResourceIndexUi {
  // Preferences persist across index/detail navigation within this admin surface.
  state = $state<{
    isControlBarVisible: Record<NavigableResource, boolean>
    layoutMode: Record<NavigableResource, LayoutMode>
  }>({
    isControlBarVisible: {
      organisation: false,
      project: false,
      layer: false,
      feature: true,
      task: true,
      hub: false,
      user: false,
    },
    layoutMode: {
      organisation: 'card',
      project: 'card',
      layer: 'card',
      feature: 'table',
      task: 'table',
      hub: 'card',
      user: 'table',
    },
  })
}
