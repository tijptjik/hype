export type FeatureCardResponsiveMode =
  | 'tiny'
  | 'small'
  | 'smallWide'
  | 'desktop'
  | 'desktopWide'

export type PropertyLayoutItem = {
  id: string
  label: string
  value: string
}

export type PropertyPreparedItem = {
  id: string
  label: string
  value: string
  labelWidth: number
  singleLineValueWidth: number
  widthForTwoLines: number
  widthForThreeLines: number
}

export type PropertyLayoutCell = {
  id: string
  row: number
  column: number
  colSpan: number
  scrollAfterLines: 2 | 3
  valueLineCount: number
  clampedValueLineCount: number
  height: number
}

export type PropertyLayoutScore = {
  overflowCellCount: number
  overflowLineCount: number
  rowCount: number
  totalHeight: number
}

export type PropertyLayoutSearchResult = {
  cells: PropertyLayoutCell[]
  overflowIds: Set<string>
  rowHeights: number[]
  score: PropertyLayoutScore
}

export type PropertyLayoutStrategy = 'default' | 'overflow'

export type PropertyLayoutResult = {
  templateColumns: string
  columns: number
  cells: PropertyLayoutCell[]
  cellOverflowIds: Set<string>
  rowHeights: number[]
  totalHeight: number
  totalWidth: number
}

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
