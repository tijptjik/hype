export type FeatureCardResponsiveMode =
  | 'tiny'
  | 'small'
  | 'smallWide'
  | 'desktop'
  | 'desktopWide'

export type FeatureCardLayout = {
  mode: FeatureCardResponsiveMode
  cardMaxWidthPx: number | null
  inlinePaddingPx: number
  topOffsetPx: number
  bottomOffsetPx: number
  bottomSpacerPx: number
  outerMarginTopPx: number
  outerMarginBottomPx: number
  heightBudgetPx: number
  hasElevatedChrome: boolean
  chromeRadiusPx: number
  chromeBorderWidthPx: number
  viewerMinHeightPx: number
  viewerPaddingPx: number
  viewerTopPaddingPx: number
  viewerRadiusPx: number
  breadcrumbsPaddingXPx: number
  contentPaddingXPx: number
  contentGapPx: number
}

export type FeatureCardLayoutChange = {
  layout: FeatureCardLayout
}
