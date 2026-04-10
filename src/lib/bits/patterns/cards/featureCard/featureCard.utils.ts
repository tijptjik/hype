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

/**
 * Returns whether a feature-card action should collapse to its icon-only form.
 *
 * @param availableWidth Effective width available to the feature card.
 * @param hideLabelBelow Width threshold below which the action label should hide.
 * @returns `true` when the action should use its collapsed icon treatment.
 */
export function shouldCollapseFeatureCardAction(
  availableWidth: number,
  hideLabelBelow?: number | null,
): boolean {
  return hideLabelBelow !== undefined && hideLabelBelow !== null
    ? availableWidth < hideLabelBelow
    : false
}
