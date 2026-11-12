// CONTEXT
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'

export type FeaturePrismResource =
  | 'organisation'
  | 'project'
  | 'layer'
  | 'location'
  | 'brand'

/**
 * Create an independent feature index for one persisted resource.
 * @param parent - Owning admin view supplying account, hub and responsive state.
 * @param resourceType - The hierarchy level, Location relationship, or catalogue brand constrained by the index query.
 * @param resourceId - Resolved database ID, never a route code.
 * @returns A view with its own cache, pagination, filters and hierarchy prism selection.
 * @remarks The caller must dispose this view. Server authorization and hub scope remain in force. Location and brand callers must also pass their constraint to AdminFeatureIndex.
 */
export function createScopedFeatureView(
  parent: ResourceViewCtx,
  resourceType: FeaturePrismResource,
  resourceId: string,
): ResourceViewCtx {
  if (!resourceId) throw new Error('A persisted resource ID is required')
  const view = new ResourceViewCtx(
    new DivisionCtx(),
    parent.account,
    parent.responsiveCtx,
    undefined,
    'admin',
  )
  // Own collection handles so loading this tab cannot replace the global index.
  view.hub = parent.hub
  view.scope.prisms = {
    organisation: [],
    project: [],
    layer: [],
    ...(resourceType === 'location' || resourceType === 'brand'
      ? {}
      : { [resourceType]: [resourceId] }),
  }
  return view
}
