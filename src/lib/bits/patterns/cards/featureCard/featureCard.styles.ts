// BITS
import { cssVars } from '$lib/bits/utils'
// TYPES
import type { FeatureCardLayout } from './featureCard.types'

const FEATURE_CARD_WIDE_SHADOW =
  '0 0 10px rgba(59,130,246,0.2), 0 0 20px rgba(59,130,246,0.1)'

/**
 * Converts layout and chrome values into inspectable CSS custom properties.
 *
 * @param params Root layout inputs.
 * @returns Inline CSS variable declarations.
 */
export function getFeatureCardRootVars(params: {
  layout: FeatureCardLayout
  horizontalOffsetPx: number
  availableWidthPx: number
}): string {
  const { layout, horizontalOffsetPx, availableWidthPx } = params
  const chromeInnerRadiusPx = Math.max(
    0,
    layout.chromeRadiusPx - layout.chromeBorderWidthPx,
  )
  const availableCardWidthPx = Math.max(
    availableWidthPx - layout.inlinePaddingPx * 2,
    0,
  )
  const resolvedCardMaxWidthPx = layout.cardMaxWidthPx
    ? Math.min(layout.cardMaxWidthPx, availableCardWidthPx)
    : availableCardWidthPx

  return cssVars({
    '--feature-card-horizontal-offset': `${horizontalOffsetPx}px`,
    '--feature-card-inline-padding': `${layout.inlinePaddingPx}px`,
    '--feature-card-shell-top-padding': `${
      (layout.hasElevatedChrome ? layout.topOffsetPx : 0) + layout.outerMarginTopPx
    }px`,
    '--feature-card-shell-bottom-padding': `${layout.outerMarginBottomPx}px`,
    '--feature-card-max-width': `${resolvedCardMaxWidthPx}px`,
    '--feature-card-max-height': `${layout.heightBudgetPx}px`,
    '--feature-card-chrome-radius': `${layout.chromeRadiusPx}px`,
    '--feature-card-chrome-inner-radius': `${chromeInnerRadiusPx}px`,
    '--feature-card-border-width': `${layout.chromeBorderWidthPx}px`,
    '--feature-card-chrome-shadow': FEATURE_CARD_WIDE_SHADOW,
    '--feature-card-surface-shadow': FEATURE_CARD_WIDE_SHADOW,
  })
}
