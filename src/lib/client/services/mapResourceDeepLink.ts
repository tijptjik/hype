// TYPES
import type { Id } from '$lib/types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { Project } from '$lib/db/zod/schema/project.types'

/**
 * Resolves the layers selected by a project or layer map deep link.
 *
 * @param searchParams - Query parameters from the incoming map URL.
 * @param layers - Layers available in the current hub scope.
 * @param projects - Projects available in the current hub scope.
 * @returns Selected layer IDs, or `null` when no map resource target was supplied.
 * @remarks An explicit `layerId` takes precedence over project targeting. Project
 * IDs take precedence over project codes to match screensaver URL behavior.
 */
export function getMapResourceDeepLinkLayerIds(
  searchParams: URLSearchParams,
  layers: ReadonlyArray<Pick<Layer, 'id' | 'projectId'>>,
  projects: ReadonlyArray<Pick<Project, 'id' | 'code'>>,
): Id[] | null {
  const layerId = searchParams.get('layerId')?.trim() ?? ''
  const projectId = searchParams.get('projectId')?.trim() ?? ''
  const projectCode = searchParams.get('project')?.trim() ?? ''

  if (!layerId && !projectId && !projectCode) {
    return null
  }

  const resolvedProjectId =
    projectId || projects.find(project => project.code === projectCode)?.id || ''

  if (layerId) {
    return layers.filter(layer => layer.id === layerId).map(layer => layer.id)
  }

  return layers
    .filter(layer => layer.projectId === resolvedProjectId)
    .map(layer => layer.id)
}
