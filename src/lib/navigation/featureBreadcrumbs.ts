// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { ResourceContext } from '#lib/types.js'

type HierarchyReader = Pick<
  ResourceViewCtx,
  'getLayerById' | 'getProjectById' | 'getOrganisationById'
>

/** Read optional navigation context without treating a hidden parent as a broken Feature.
 * @param read Authorized parent lookup using the current surface scope.
 * @returns The visible parent, or undefined when it is forbidden or no longer exists.
 * @remarks Authentication, transport and server failures still propagate; no cached denial fallback.
 */
async function visibleParent<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read()
  } catch (error) {
    const status = (error as { status?: number } | null)?.status
    if (status === 403 || status === 404) return undefined
    throw error
  }
}

/** Resolve each breadcrumb independently for an already loaded Feature.
 * @param feature Authorized Feature with its persisted parent identifiers.
 * @param reader Current surface's authorization-scoped resource lookups.
 * @returns Only readable ancestors; an unpublished parent does not hide other visible crumbs.
 * @remarks Feature publication does not grant parent-resource access. This helper is for
 * navigation only; editing and other strict hierarchy consumers retain their existing checks.
 */
export async function getFeatureBreadcrumbHierarchy(
  feature: Feature,
  reader: HierarchyReader,
): Promise<ResourceContext> {
  const [layer, project, organisation] = await Promise.all([
    visibleParent(() => reader.getLayerById(feature.layerId)),
    visibleParent(() => reader.getProjectById(feature.projectId)),
    visibleParent(() => reader.getOrganisationById(feature.organisationId)),
  ])
  return { feature, layer, project, organisation }
}
