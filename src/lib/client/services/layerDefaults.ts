// TYPES
import type { HubLayerDefaultsContext, Id } from '$lib/types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { Project } from '$lib/db/zod/schema/project.types'

// The Neon Signs project is the curated starting point for visitors to hype.hk.
export const CORE_DEFAULT_PROJECT_CODE = 'neon'

/**
 * Resolves the layers to activate when a visitor has no saved layer selection.
 *
 * @param hub - The active hub context and its configured layer defaults.
 * @param layers - Layers available in the active hub scope.
 * @param projects - Projects available in the active hub scope.
 * @returns Ordered, unique IDs for the initial active layers.
 * @remarks Hub-configured defaults take precedence. The virtual core hub falls
 * back to Neon Signs' default-visible layers because it has no persisted hub row.
 */
export function getInitialHubLayerDefaultIds(
  hub: HubLayerDefaultsContext | null | undefined,
  layers: ReadonlyArray<Pick<Layer, 'id' | 'projectId' | 'isDefaultVisible'>>,
  projects: ReadonlyArray<Pick<Project, 'id' | 'code'>>,
): Id[] {
  const availableLayerIds = new Set(layers.map(layer => layer.id))
  const hubDefaultLayerIds = (hub?.layerDefaults ?? [])
    .filter(layerDefault => layerDefault.isDefaultVisible)
    .map(layerDefault => layerDefault.layerId)
    .filter(layerId => availableLayerIds.has(layerId))

  if (hubDefaultLayerIds.length > 0) {
    return [...new Set(hubDefaultLayerIds)]
  }

  if (!hub?.isCore && hub?.code !== 'core') {
    return []
  }

  const coreDefaultProjectIds = new Set(
    projects
      .filter(project => project.code === CORE_DEFAULT_PROJECT_CODE)
      .map(project => project.id),
  )

  return layers
    .filter(
      layer => coreDefaultProjectIds.has(layer.projectId) && layer.isDefaultVisible,
    )
    .map(layer => layer.id)
}
