// TYPES
import type { Prisms } from '#lib/types.js'

export const MAP_PRISM_PARAMS = [
  'prismOrganisation',
  'prismProject',
  'prismLayer',
] as const

/**
 * Builds the public map destination for the current admin selection.
 * @param prisms Explicit hierarchy selections in the admin panel.
 * @param resourceType Current admin resource type.
 * @param resourceRef Current persisted resource reference, or false on indexes.
 * @param task Loaded task association when the current resource is a task.
 * @returns A feature detail URL or map URL carrying the hierarchy selection.
 * @remarks Admin-only facets and panels are deliberately excluded.
 */
export function getAdminMapHref(
  prisms: Prisms,
  resourceType: string | false,
  resourceRef: string | false,
  task?: { featureId?: string | null; feature?: { id?: string | null } | null } | null,
): string {
  const params = new URLSearchParams({ mapPrisms: '1' })
  const selection = {
    organisation: [...prisms.organisation],
    project: [...prisms.project],
    layer: [...prisms.layer],
  }
  const hasResource = resourceRef && resourceRef !== 'new'
  if (
    hasResource &&
    (resourceType === 'organisation' ||
      resourceType === 'project' ||
      resourceType === 'layer')
  ) {
    if (!selection[resourceType].includes(resourceRef))
      selection[resourceType].push(resourceRef)
  }
  for (const [index, key] of (
    ['organisation', 'project', 'layer'] as const
  ).entries()) {
    for (const ref of selection[key]) params.append(MAP_PRISM_PARAMS[index], ref)
  }
  const featureId = hasResource
    ? resourceType === 'feature'
      ? resourceRef
      : resourceType === 'task'
        ? task?.featureId || task?.feature?.id
        : null
    : null
  const path = featureId ? `/features/${encodeURIComponent(featureId)}` : '/'
  return `${path}?${params}`
}

/**
 * Reads an explicit admin-to-map hierarchy transfer, including empty selections.
 * @param params Incoming URL parameters.
 * @returns Transferred prisms, or null for an ordinary map visit.
 */
export function getMapPrisms(
  params: Pick<URLSearchParams, 'get' | 'getAll'>,
): Prisms | null {
  if (params.get('mapPrisms') !== '1') return null
  return {
    organisation: params.getAll(MAP_PRISM_PARAMS[0]),
    project: params.getAll(MAP_PRISM_PARAMS[1]),
    layer: params.getAll(MAP_PRISM_PARAMS[2]),
  }
}
