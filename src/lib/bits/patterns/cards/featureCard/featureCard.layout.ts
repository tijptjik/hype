// THIRD PARTY
import { layout, prepare, prepareWithSegments } from '@chenglou/pretext'
// BITS
import { cssVars } from '$lib/bits/utils'
// BARS
import { getMenuClearanceHeight } from '$lib/bits/patterns/bars/appMenu/appMenu.layout'
import {
  getElevatedChromeXGutter,
  getOmnibarClearanceHeight,
} from '$lib/bits/patterns/bars/omnibar'
// CONTEXT
import { hasElevatedChrome } from '$lib/context/responsive.svelte'
// TYPES
import type {
  FeatureCardLayout,
  FeatureCardResponsiveMode,
  PropertyLayoutCell,
  PropertyLayoutItem,
  PropertyLayoutResult,
  PropertyLayoutScore,
  PropertyLayoutSearchResult,
  PropertyLayoutStrategy,
  PropertyPreparedItem,
} from './featureCard.types'

const FEATURE_CARD_TINY_MAX_WIDTH_PX = 400
const FEATURE_CARD_SMALL_MAX_WIDTH_PX = 480
const FEATURE_CARD_DESKTOP_MAX_WIDTH_PX = 768
const FEATURE_CARD_WIDE_DESKTOP_MAX_WIDTH_PX = 1280
const FEATURE_CARD_CONTENT_PADDING_PX = 8
const FEATURE_CARD_FLAT_RADIUS_PX = 0
const FEATURE_CARD_BORDER_WIDTH_PX = 8
const FEATURE_CARD_ELEVATED_BORDER_WIDTH_PX = 12
const FEATURE_CARD_VIEWER_RADIUS_PX = 12
const FEATURE_CARD_BREADCRUMBS_PADDING_PX = 12
const FEATURE_CARD_TINY_BREADCRUMBS_PADDING_PX = 6
const FEATURE_CARD_CONTENT_GAP_PX = 8
const FEATURE_CARD_APPMENU_SPACER_PX = 50
const FEATURE_CARD_VIEWER_MIN_HEIGHT_PX = 320
const FEATURE_CARD_VIEWER_PADDING_PX = 0
const FEATURE_CARD_VIEWER_TOP_PADDING_PX = 0
const _DESCRIPTION_FONT = '300 15px Geologica'
const _DESCRIPTION_LINE_HEIGHT = 22
const PROPERTY_LABEL_FONT = '400 12px "IBM Plex Mono"'
const PROPERTY_LABEL_LINE_HEIGHT = 16
const PROPERTY_VALUE_FONT = '500 15px Geologica'
const PROPERTY_VALUE_LINE_HEIGHT = 22
const PROPERTY_MIN_CELL_WIDTH = 88
const PROPERTY_LAYOUT_SEARCH_STEPS = 14
const PROPERTY_ROW_GAP_PX = 8
const PROPERTY_VALUE_TOP_MARGIN_PX = 2

/**
 * Resolves the feature-card responsive tier from viewport dimensions.
 *
 * @param width Current viewport width in pixels.
 * @param height Current viewport height in pixels.
 * @returns The feature-card responsive mode.
 */
export function getFeatureCardResponsiveMode(
  width: number,
  height: number,
): FeatureCardResponsiveMode {
  const normalizedWidth = Math.ceil(width)
  void height

  if (normalizedWidth < FEATURE_CARD_TINY_MAX_WIDTH_PX) {
    return 'tiny'
  }

  if (normalizedWidth < FEATURE_CARD_SMALL_MAX_WIDTH_PX) return 'small'
  if (normalizedWidth < FEATURE_CARD_DESKTOP_MAX_WIDTH_PX) return 'smallWide'
  if (normalizedWidth < FEATURE_CARD_WIDE_DESKTOP_MAX_WIDTH_PX) return 'desktop'

  return 'desktopWide'
}

/**
 * Builds the feature-card layout contract used by the root/container/actions layers.
 *
 * @param params Layout inputs derived from viewport state.
 * @param params.width Current viewport width in pixels.
 * @param params.height Current viewport height in pixels.
 * @param params.heightBudgetPx Optional maximum height budget in pixels.
 * @returns Resolved layout metrics and behavior flags.
 */
export function getFeatureCardLayout(params: {
  width: number
  height: number
  heightBudgetPx?: number | null
}): FeatureCardLayout {
  // Viewport dimensions and optional height budget
  const { width, height, heightBudgetPx = null } = params
  // Get 'tiny', 'small', 'smallWide', 'desktop', or 'desktopWide' responsive modes
  const mode = getFeatureCardResponsiveMode(width, height)
  // Elevated Chrome requires spacing around Omnibar, the card and the viewport edges
  const elevatedChrome = hasElevatedChrome(width, height)
  // Reserve the app-menu footprint so the card clears the bottom chrome when floated
  const menuClearanceHeightPx = getMenuClearanceHeight(width, height)
  // Reserve the omnibar footprint from the shared omnibar layout rules
  const omnibarClearanceHeightPx = getOmnibarClearanceHeight(width, height)
  const elevatedChromeXGutterPx = elevatedChrome ? getElevatedChromeXGutter(width) : 0
  // The omnibar already participates in document flow; only the floating card
  // height budget needs to account for that clearance, not the shell padding.
  const topOffsetPx = 0
  // Elevated layouts reserve the menu footprint; the outer margin supplies the
  // visible 24px breathing room above the menu.
  const bottomOffsetPx = elevatedChrome ? menuClearanceHeightPx : 0
  const bottomSpacerPx = elevatedChrome ? 0 : FEATURE_CARD_APPMENU_SPACER_PX
  // Elevated chrome clearance already includes the gutter below the omnibar.
  const outerMarginTopPx = 0
  const outerMarginBottomPx =
    elevatedChrome && mode !== 'tiny' ? elevatedChromeXGutterPx : 0
  const chromeBorderWidthPx = elevatedChrome
    ? FEATURE_CARD_ELEVATED_BORDER_WIDTH_PX
    : FEATURE_CARD_BORDER_WIDTH_PX
  const viewerPaddingPx = FEATURE_CARD_VIEWER_PADDING_PX
  const viewerTopPaddingPx = FEATURE_CARD_VIEWER_TOP_PADDING_PX
  // Height budget available for the feature card shell
  const derivedHeightBudgetPx = Math.max(
    0,
    height -
      omnibarClearanceHeightPx -
      bottomOffsetPx -
      outerMarginTopPx -
      outerMarginBottomPx,
  )
  const resolvedHeightBudgetPx =
    heightBudgetPx && heightBudgetPx > 0 ? heightBudgetPx : derivedHeightBudgetPx

  if (mode === 'tiny') {
    return {
      mode,
      cardMaxWidthPx: null,
      inlinePaddingPx: 0,
      topOffsetPx,
      bottomOffsetPx,
      bottomSpacerPx,
      outerMarginTopPx,
      outerMarginBottomPx,
      heightBudgetPx: resolvedHeightBudgetPx,
      hasElevatedChrome: false,
      chromeRadiusPx: FEATURE_CARD_FLAT_RADIUS_PX,
      chromeBorderWidthPx,
      viewerMinHeightPx: FEATURE_CARD_VIEWER_MIN_HEIGHT_PX,
      viewerPaddingPx,
      viewerTopPaddingPx,
      viewerRadiusPx: FEATURE_CARD_FLAT_RADIUS_PX,
      breadcrumbsPaddingXPx: FEATURE_CARD_TINY_BREADCRUMBS_PADDING_PX,
      contentPaddingXPx: FEATURE_CARD_CONTENT_PADDING_PX,
      contentGapPx: FEATURE_CARD_CONTENT_GAP_PX,
    }
  }

  if (mode === 'small') {
    return {
      mode,
      cardMaxWidthPx: null,
      inlinePaddingPx: elevatedChromeXGutterPx,
      topOffsetPx,
      bottomOffsetPx,
      bottomSpacerPx,
      outerMarginTopPx,
      outerMarginBottomPx,
      heightBudgetPx: resolvedHeightBudgetPx,
      hasElevatedChrome: elevatedChrome,
      chromeRadiusPx: elevatedChrome
        ? FEATURE_CARD_VIEWER_RADIUS_PX + chromeBorderWidthPx
        : FEATURE_CARD_FLAT_RADIUS_PX,
      chromeBorderWidthPx,
      viewerMinHeightPx: FEATURE_CARD_VIEWER_MIN_HEIGHT_PX,
      viewerPaddingPx,
      viewerTopPaddingPx,
      viewerRadiusPx: elevatedChrome
        ? FEATURE_CARD_VIEWER_RADIUS_PX
        : FEATURE_CARD_FLAT_RADIUS_PX,
      breadcrumbsPaddingXPx: FEATURE_CARD_BREADCRUMBS_PADDING_PX,
      contentPaddingXPx: FEATURE_CARD_CONTENT_PADDING_PX,
      contentGapPx: FEATURE_CARD_CONTENT_GAP_PX,
    }
  }

  if (mode === 'smallWide') {
    return {
      mode,
      cardMaxWidthPx: null,
      inlinePaddingPx: elevatedChromeXGutterPx,
      topOffsetPx,
      bottomOffsetPx,
      bottomSpacerPx,
      outerMarginTopPx,
      outerMarginBottomPx,
      heightBudgetPx: resolvedHeightBudgetPx,
      hasElevatedChrome: elevatedChrome,
      chromeRadiusPx: elevatedChrome
        ? FEATURE_CARD_VIEWER_RADIUS_PX + chromeBorderWidthPx
        : FEATURE_CARD_FLAT_RADIUS_PX,
      chromeBorderWidthPx,
      viewerMinHeightPx: FEATURE_CARD_VIEWER_MIN_HEIGHT_PX,
      viewerPaddingPx,
      viewerTopPaddingPx,
      viewerRadiusPx: elevatedChrome
        ? FEATURE_CARD_VIEWER_RADIUS_PX
        : FEATURE_CARD_FLAT_RADIUS_PX,
      breadcrumbsPaddingXPx: FEATURE_CARD_BREADCRUMBS_PADDING_PX,
      contentPaddingXPx: FEATURE_CARD_CONTENT_PADDING_PX,
      contentGapPx: FEATURE_CARD_CONTENT_GAP_PX,
    }
  }

  if (mode === 'desktop') {
    return {
      mode,
      cardMaxWidthPx: elevatedChrome ? 736 : null,
      inlinePaddingPx: elevatedChromeXGutterPx,
      topOffsetPx,
      bottomOffsetPx,
      bottomSpacerPx,
      outerMarginTopPx,
      outerMarginBottomPx,
      heightBudgetPx: resolvedHeightBudgetPx,
      hasElevatedChrome: elevatedChrome,
      chromeRadiusPx: elevatedChrome
        ? FEATURE_CARD_VIEWER_RADIUS_PX + chromeBorderWidthPx
        : FEATURE_CARD_FLAT_RADIUS_PX,
      chromeBorderWidthPx,
      viewerMinHeightPx: FEATURE_CARD_VIEWER_MIN_HEIGHT_PX,
      viewerPaddingPx,
      viewerTopPaddingPx,
      viewerRadiusPx: elevatedChrome
        ? FEATURE_CARD_VIEWER_RADIUS_PX
        : FEATURE_CARD_FLAT_RADIUS_PX,
      breadcrumbsPaddingXPx: FEATURE_CARD_BREADCRUMBS_PADDING_PX,
      contentPaddingXPx: FEATURE_CARD_CONTENT_PADDING_PX,
      contentGapPx: FEATURE_CARD_CONTENT_GAP_PX,
    }
  }

  return {
    mode,
    cardMaxWidthPx: elevatedChrome ? 1024 : null,
    inlinePaddingPx: elevatedChromeXGutterPx,
    topOffsetPx,
    bottomOffsetPx,
    bottomSpacerPx,
    outerMarginTopPx,
    outerMarginBottomPx,
    heightBudgetPx: resolvedHeightBudgetPx,
    hasElevatedChrome: elevatedChrome,
    chromeRadiusPx: elevatedChrome
      ? FEATURE_CARD_VIEWER_RADIUS_PX + chromeBorderWidthPx
      : FEATURE_CARD_FLAT_RADIUS_PX,
    chromeBorderWidthPx,
    viewerMinHeightPx: FEATURE_CARD_VIEWER_MIN_HEIGHT_PX,
    viewerPaddingPx,
    viewerTopPaddingPx,
    viewerRadiusPx: elevatedChrome
      ? FEATURE_CARD_VIEWER_RADIUS_PX
      : FEATURE_CARD_FLAT_RADIUS_PX,
    breadcrumbsPaddingXPx: FEATURE_CARD_BREADCRUMBS_PADDING_PX,
    contentPaddingXPx: FEATURE_CARD_CONTENT_PADDING_PX,
    contentGapPx: FEATURE_CARD_CONTENT_GAP_PX,
  }
}

/**
 * Converts a resolved layout into feature-card spacing CSS custom properties.
 *
 * @param layout Resolved layout metrics.
 * @returns Inline CSS variable declarations.
 */
export function getFeatureCardLayoutVars(layout: FeatureCardLayout): string {
  return cssVars(
    { '--feature-card-viewer-padding': `${layout.viewerPaddingPx}px` },
    { '--feature-card-viewer-padding-top': `${layout.viewerTopPaddingPx}px` },
    { '--feature-card-viewer-radius': `${layout.viewerRadiusPx}px` },
    { '--feature-card-viewer-inner-radius': `${layout.viewerRadiusPx}px` },
    { '--feature-card-breadcrumbs-padding': `${layout.breadcrumbsPaddingXPx}px` },
    { '--feature-card-content-padding': `${layout.contentPaddingXPx}px` },
    { '--feature-card-content-gap': `${layout.contentGapPx}px` },
  )
}

/**
 * Preserves visible paragraph breaks for measurement while stripping inline markup.
 *
 * @param input Raw rich-text HTML.
 * @returns Plain text with explicit line breaks preserved.
 */
export function stripRichTextToPlainText(input: string): string {
  if (!input) return ''

  const withExplicitBreaks = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')

  if (typeof window === 'undefined') {
    return withExplicitBreaks.replace(/<[^>]+>/g, '').trim()
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(withExplicitBreaks, 'text/html')
  return document.body.textContent?.trim() ?? ''
}

/**
 * Maps viewport height onto the collapsed description line budget.
 *
 * @param viewportHeight Current viewport height in pixels.
 * @returns Allowed collapsed line count.
 */
export function getFeatureCardCollapsedDescriptionLineCount(
  viewportHeight: number,
): number {
  if (viewportHeight >= 1280) return 6
  if (viewportHeight >= 1024) return 5
  if (viewportHeight >= 896) return 4
  return 2
}

function measureSingleLineWidth(text: string, font: string): number {
  const prepared = prepareWithSegments(text, font, {
    whiteSpace: 'pre-wrap',
  })

  return layout(prepared, 100000, 1).height > 0
    ? prepared.segments.reduce((total, _segment, index) => {
        return total + (prepared.widths[index] ?? 0)
      }, 0)
    : 0
}

function measureWidthForLineBudget(
  text: string,
  font: string,
  lineHeight: number,
  maxLines: number,
): number {
  const prepared = prepare(text, font, {
    whiteSpace: 'pre-wrap',
  })

  const singleLineWidth = Math.max(
    PROPERTY_MIN_CELL_WIDTH,
    measureSingleLineWidth(text, font),
  )

  let low = PROPERTY_MIN_CELL_WIDTH
  let high = Math.ceil(singleLineWidth)

  for (let index = 0; index < PROPERTY_LAYOUT_SEARCH_STEPS; index += 1) {
    const mid = Math.floor((low + high) / 2)
    const result = layout(prepared, mid, lineHeight)

    if (result.lineCount <= maxLines) {
      high = mid
    } else {
      low = mid + 1
    }
  }

  return high
}

function preparePropertyItems(items: PropertyLayoutItem[]): PropertyPreparedItem[] {
  return items.map(item => ({
    id: item.id,
    label: item.label,
    value: item.value,
    labelWidth: Math.ceil(measureSingleLineWidth(item.label, PROPERTY_LABEL_FONT)),
    singleLineValueWidth: Math.ceil(
      measureSingleLineWidth(item.value, PROPERTY_VALUE_FONT),
    ),
    widthForTwoLines: Math.ceil(
      measureWidthForLineBudget(
        item.value,
        PROPERTY_VALUE_FONT,
        PROPERTY_VALUE_LINE_HEIGHT,
        2,
      ),
    ),
    widthForThreeLines: Math.ceil(
      measureWidthForLineBudget(
        item.value,
        PROPERTY_VALUE_FONT,
        PROPERTY_VALUE_LINE_HEIGHT,
        3,
      ),
    ),
  }))
}

function comparePropertyLayoutScores(
  left: PropertyLayoutScore,
  right: PropertyLayoutScore,
): number {
  if (left.overflowCellCount !== right.overflowCellCount) {
    return left.overflowCellCount - right.overflowCellCount
  }

  if (left.overflowLineCount !== right.overflowLineCount) {
    return left.overflowLineCount - right.overflowLineCount
  }

  if (left.rowCount !== right.rowCount) {
    return left.rowCount - right.rowCount
  }

  return left.totalHeight - right.totalHeight
}

function comparePropertyLayoutResults(
  left: PropertyLayoutResult,
  right: PropertyLayoutResult,
  strategy: PropertyLayoutStrategy,
): number {
  const leftScore: PropertyLayoutScore = {
    overflowCellCount: left.cellOverflowIds.size,
    overflowLineCount: left.cells.reduce(
      (sum, cell) => sum + Math.max(0, cell.valueLineCount - cell.scrollAfterLines),
      0,
    ),
    rowCount: left.rowHeights.length,
    totalHeight: left.totalHeight,
  }
  const rightScore: PropertyLayoutScore = {
    overflowCellCount: right.cellOverflowIds.size,
    overflowLineCount: right.cells.reduce(
      (sum, cell) => sum + Math.max(0, cell.valueLineCount - cell.scrollAfterLines),
      0,
    ),
    rowCount: right.rowHeights.length,
    totalHeight: right.totalHeight,
  }

  if (strategy === 'overflow') {
    if (leftScore.overflowCellCount !== rightScore.overflowCellCount) {
      return leftScore.overflowCellCount - rightScore.overflowCellCount
    }

    if (leftScore.rowCount !== rightScore.rowCount) {
      return leftScore.rowCount - rightScore.rowCount
    }

    if (left.columns !== right.columns) {
      return right.columns - left.columns
    }

    if (leftScore.overflowLineCount !== rightScore.overflowLineCount) {
      return leftScore.overflowLineCount - rightScore.overflowLineCount
    }

    return leftScore.totalHeight - rightScore.totalHeight
  }

  return comparePropertyLayoutScores(leftScore, rightScore)
}

function getPropertyCellHeight(lineCount: number, lineBudget: 2 | 3): number {
  return (
    PROPERTY_LABEL_LINE_HEIGHT +
    PROPERTY_VALUE_TOP_MARGIN_PX +
    Math.min(lineCount, lineBudget) * PROPERTY_VALUE_LINE_HEIGHT
  )
}

function getPropertyGridHeight(rowHeights: number[]): number {
  return (
    rowHeights.reduce((sum, height) => sum + height, 0) +
    Math.max(rowHeights.length - 1, 0) * PROPERTY_ROW_GAP_PX
  )
}

function getPropertySpanWidth(
  widths: number[],
  startColumn: number,
  colSpan: number,
  gap: number,
): number {
  return (
    widths
      .slice(startColumn, startColumn + colSpan)
      .reduce((sum, width) => sum + width, 0) +
    gap * Math.max(colSpan - 1, 0)
  )
}

function getPropertyValueLineCount(item: PropertyPreparedItem, width: number): number {
  return layout(
    prepare(item.value, PROPERTY_VALUE_FONT, { whiteSpace: 'pre-wrap' }),
    width,
    PROPERTY_VALUE_LINE_HEIGHT,
  ).lineCount
}

function searchCandidateLayout(params: {
  items: PropertyPreparedItem[]
  widths: number[]
  gap: number
  columns: number
  lineBudget: 2 | 3
}): PropertyLayoutSearchResult {
  const { items, widths, gap, columns, lineBudget } = params
  const memo = new Map<string, PropertyLayoutSearchResult>()

  function visit(
    index: number,
    row: number,
    column: number,
    rowHeights: number[],
  ): PropertyLayoutSearchResult {
    if (index >= items.length) {
      const finalizedRowHeights = [...rowHeights]

      return {
        cells: [],
        overflowIds: new Set<string>(),
        rowHeights: finalizedRowHeights,
        score: {
          overflowCellCount: 0,
          overflowLineCount: 0,
          rowCount: finalizedRowHeights.length,
          totalHeight: getPropertyGridHeight(finalizedRowHeights),
        },
      }
    }

    const normalizedRowHeights = [...rowHeights]
    if (normalizedRowHeights.length === 0) {
      normalizedRowHeights.push(0)
    }

    const memoKey = [index, row, column, normalizedRowHeights.join(',')].join('|')
    const memoized = memo.get(memoKey)

    if (memoized) {
      return memoized
    }

    const item = items[index]
    const remainingColumns = columns - column
    let best: PropertyLayoutSearchResult | null = null

    for (let colSpan = 1; colSpan <= remainingColumns; colSpan += 1) {
      const spanWidth = getPropertySpanWidth(widths, column, colSpan, gap)
      const valueLineCount = getPropertyValueLineCount(item, spanWidth)
      const height = getPropertyCellHeight(valueLineCount, lineBudget)
      const nextRowHeights = [...normalizedRowHeights]
      nextRowHeights[row] = Math.max(nextRowHeights[row] ?? 0, height)

      const nextColumn = column + colSpan
      const advancesRow = nextColumn >= columns
      const nextRow = advancesRow ? row + 1 : row
      const nextColumnNormalized = advancesRow ? 0 : nextColumn
      const nextRowHeightsForTail = advancesRow
        ? [...nextRowHeights, 0]
        : nextRowHeights
      const tail = visit(
        index + 1,
        nextRow,
        nextColumnNormalized,
        nextRowHeightsForTail,
      )

      const finalizedRowHeights =
        tail.rowHeights.length > 0 && tail.rowHeights.at(-1) === 0
          ? tail.rowHeights.slice(0, -1)
          : tail.rowHeights
      const overflowLineCount = Math.max(0, valueLineCount - lineBudget)
      const overflowCellCount = valueLineCount > lineBudget ? 1 : 0
      const overflowIds = new Set(tail.overflowIds)

      if (overflowCellCount > 0) {
        overflowIds.add(item.id)
      }

      const candidateCells = [
        {
          id: item.id,
          row,
          column,
          colSpan,
          scrollAfterLines: lineBudget,
          valueLineCount,
          clampedValueLineCount: Math.min(valueLineCount, lineBudget),
          height,
        },
        ...tail.cells,
      ]
      const candidateScore: PropertyLayoutScore = {
        overflowCellCount: tail.score.overflowCellCount + overflowCellCount,
        overflowLineCount: tail.score.overflowLineCount + overflowLineCount,
        rowCount: finalizedRowHeights.length,
        totalHeight: getPropertyGridHeight(finalizedRowHeights),
      }
      const candidate: PropertyLayoutSearchResult = {
        cells: candidateCells,
        overflowIds,
        rowHeights: finalizedRowHeights,
        score: candidateScore,
      }

      if (!best || comparePropertyLayoutScores(candidate.score, best.score) < 0) {
        best = candidate
      }
    }

    const resolvedBest =
      best ??
      ({
        cells: [],
        overflowIds: new Set<string>(),
        rowHeights: normalizedRowHeights,
        score: {
          overflowCellCount: Number.POSITIVE_INFINITY,
          overflowLineCount: Number.POSITIVE_INFINITY,
          rowCount: normalizedRowHeights.length,
          totalHeight: Number.POSITIVE_INFINITY,
        },
      } satisfies PropertyLayoutSearchResult)

    memo.set(memoKey, resolvedBest)
    return resolvedBest
  }

  return visit(0, 0, 0, [0])
}

function buildCandidateLayout(params: {
  items: PropertyPreparedItem[]
  availableWidth: number
  gap: number
  columns: number
  lineBudget: 2 | 3
}): {
  widths: number[]
  totalWidth: number
  cells: PropertyLayoutCell[]
  overflowIds: Set<string>
  rowHeights: number[]
} {
  const { items, availableWidth, gap, columns, lineBudget } = params
  const widths = Array(columns).fill(0) as number[]

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const column = index % columns
    const preferredWidth = Math.max(
      item.labelWidth,
      lineBudget === 2 ? item.widthForTwoLines : item.widthForThreeLines,
      PROPERTY_MIN_CELL_WIDTH,
    )

    widths[column] = Math.max(widths[column] ?? 0, preferredWidth)
  }

  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (columns - 1)

  const resolvedWidths =
    columns === 1
      ? [Math.max(availableWidth, PROPERTY_MIN_CELL_WIDTH)]
      : totalWidth <= availableWidth
        ? widths
        : widths.map(width =>
            Math.max(
              PROPERTY_MIN_CELL_WIDTH,
              Math.floor((width / totalWidth) * (availableWidth - gap * (columns - 1))),
            ),
          )
  const searchedLayout = searchCandidateLayout({
    items,
    widths: resolvedWidths,
    gap,
    columns,
    lineBudget,
  })

  return {
    widths: resolvedWidths,
    totalWidth:
      resolvedWidths.reduce((sum, width) => sum + width, 0) + gap * (columns - 1),
    cells: searchedLayout.cells,
    overflowIds: searchedLayout.overflowIds,
    rowHeights: searchedLayout.rowHeights,
  }
}

/**
 * Resolves a stable property-grid layout that preserves source order.
 *
 * @param items Ordered property payloads.
 * @param availableWidth Measured content width in pixels.
 * @param gap Horizontal and vertical gap between cells.
 * @returns Grid placement metadata and overflow state.
 */
function resolveFeaturePropertyLayoutWithStrategy(
  items: PropertyLayoutItem[],
  availableWidth: number,
  gap: number,
  strategy: PropertyLayoutStrategy,
): PropertyLayoutResult {
  if (items.length === 0 || availableWidth <= 0) {
    return {
      templateColumns: 'minmax(0, 1fr)',
      columns: 1,
      cells: [],
      cellOverflowIds: new Set<string>(),
      rowHeights: [],
      totalHeight: 0,
      totalWidth: 0,
    }
  }

  const preparedItems = preparePropertyItems(items)
  const maxColumns = Math.min(preparedItems.length, 4)
  let bestLayout: PropertyLayoutResult | null = null

  for (const lineBudget of [2, 3] as const) {
    for (let columns = maxColumns; columns >= 1; columns -= 1) {
      const candidate = buildCandidateLayout({
        items: preparedItems,
        availableWidth,
        gap,
        columns,
        lineBudget,
      })

      const candidateResult: PropertyLayoutResult = {
        templateColumns: candidate.widths.map(width => `${width}px`).join(' '),
        columns,
        cells: candidate.cells,
        cellOverflowIds: candidate.overflowIds,
        rowHeights: candidate.rowHeights,
        totalHeight: getPropertyGridHeight(candidate.rowHeights),
        totalWidth: candidate.totalWidth,
      }

      if (!bestLayout) {
        bestLayout = candidateResult
      } else {
        if (comparePropertyLayoutResults(candidateResult, bestLayout, strategy) < 0) {
          bestLayout = candidateResult
        }
      }

      if (candidate.totalWidth <= availableWidth && candidate.overflowIds.size === 0) {
        return candidateResult
      }
    }
  }

  const fallback = buildCandidateLayout({
    items: preparedItems,
    availableWidth,
    gap,
    columns: Math.max(1, Math.min(maxColumns, 2)),
    lineBudget: 3,
  })

  return (
    bestLayout ?? {
      templateColumns: fallback.widths.map(width => `${width}px`).join(' '),
      columns: Math.max(1, Math.min(maxColumns, 2)),
      cells: fallback.cells,
      cellOverflowIds: fallback.overflowIds,
      rowHeights: fallback.rowHeights,
      totalHeight: getPropertyGridHeight(fallback.rowHeights),
      totalWidth: fallback.totalWidth,
    }
  )
}

/**
 * Resolves a stable property-grid layout that preserves source order.
 *
 * @param items Ordered property payloads.
 * @param availableWidth Measured content width in pixels.
 * @param gap Horizontal and vertical gap between cells.
 * @returns Grid placement metadata and overflow state.
 */
export function resolveFeaturePropertyLayout(
  items: PropertyLayoutItem[],
  availableWidth: number,
  gap: number,
): PropertyLayoutResult {
  return resolveFeaturePropertyLayoutWithStrategy(items, availableWidth, gap, 'default')
}

/**
 * Resolves the lower full-width overflow grid with a denser column preference.
 *
 * @param items Ordered property payloads for the overflow region.
 * @param availableWidth Measured overflow-region width in pixels.
 * @param gap Horizontal and vertical gap between cells.
 * @returns Grid placement metadata and overflow state.
 */
export function resolveOverflowFeaturePropertyLayout(
  items: PropertyLayoutItem[],
  availableWidth: number,
  gap: number,
): PropertyLayoutResult {
  return resolveFeaturePropertyLayoutWithStrategy(
    items,
    availableWidth,
    gap,
    'overflow',
  )
}

/**
 * Measures how many properties fit inside a bounded region.
 *
 * @param items Ordered property payloads.
 * @param availableWidth Region width in pixels.
 * @param availableHeight Region height in pixels.
 * @param maxRows Maximum allowed row count.
 * @param gap Horizontal and vertical gap between cells.
 * @returns The number of items that fit and the best layout.
 */
export function fitFeaturePropertyLayoutInRegion(
  items: PropertyLayoutItem[],
  availableWidth: number,
  availableHeight: number,
  maxRows: number,
  gap: number,
): { fitCount: number; layout: PropertyLayoutResult | null } {
  if (
    items.length === 0 ||
    availableWidth <= 0 ||
    availableHeight <= 0 ||
    maxRows <= 0
  ) {
    return { fitCount: 0, layout: null }
  }

  let bestFitCount = 0
  let bestLayout: PropertyLayoutResult | null = null

  for (let count = 1; count <= items.length; count += 1) {
    const layoutResult = resolveFeaturePropertyLayout(
      items.slice(0, count),
      availableWidth,
      gap,
    )

    if (
      layoutResult.totalWidth > availableWidth ||
      layoutResult.totalHeight > availableHeight ||
      layoutResult.rowHeights.length > maxRows
    ) {
      break
    }

    bestFitCount = count
    bestLayout = layoutResult
  }

  return { fitCount: bestFitCount, layout: bestLayout }
}
