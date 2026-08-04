// CONTEXT
import type { ResponsiveCtx } from '$lib/context/responsive.svelte'

/**
 * Returns the effective width available to the feature card after open panels
 * consume space from the shared app main region.
 *
 * @param responsiveCtx Shared responsive context.
 * @returns Width in pixels used for feature-card breakpoint selection.
 */
export function getFeatureCardResponsiveWidth(responsiveCtx: ResponsiveCtx): number {
  return responsiveCtx.getEffectiveAppMainWidth() || responsiveCtx.visibleWindowWidth
}
