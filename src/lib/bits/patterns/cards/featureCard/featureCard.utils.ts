// CONTEXT
import type { SurfaceLayout } from '#lib/context/surfaceLayout.svelte.js'
import type { ResponsiveCtx } from '#lib/context/responsive.svelte.js'

/**
 * Returns the effective width available to the feature card after open panels
 * consume space from the shared app main region.
 *
 * @param responsiveCtx Root viewport measurements.
 * @param layout Surface-owned main geometry.
 * @returns Width in pixels used for feature-card breakpoint selection.
 */
export function getFeatureCardResponsiveWidth(
  responsiveCtx: ResponsiveCtx,
  layout: SurfaceLayout,
): number {
  return layout.getEffectiveAppMainWidth() || responsiveCtx.visibleWindowWidth
}
