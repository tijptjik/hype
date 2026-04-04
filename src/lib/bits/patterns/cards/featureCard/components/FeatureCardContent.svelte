<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// THIRD PARTY
import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
// SERVICES
import { getFeatureCardDisplayProperties } from '$lib/client/services/property'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// I18N
import { getFPI18n, getI18n, m } from '$lib/i18n'
// TYPES
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { FeatureCardPortalObstacle } from '$lib/types'
import type { PropertyLayoutResult } from '../featureCard.types'
// LOCAL
import {
  fitFeaturePropertyLayoutInRegion,
  getFeatureCardCollapsedDescriptionLineCount,
  getFeatureCardLayout,
  resolveOverflowFeaturePropertyLayout,
  resolveFeaturePropertyLayout,
  stripRichTextToPlainText,
} from '../featureCard.layout'
import type {
  CollapsedContentPlan,
  FeaturePropertyItem,
  PortalGeometry,
  PropertyPlacement,
  RoutedDescriptionLayout,
} from './FeatureCardContent.types'
import FeatureCardContentPortal from './content/FeatureCardContentPortal.svelte'
import FeatureCardContentFields from './content/FeatureCardContentFields.svelte'

const DESCRIPTION_FONT = '300 15px Geologica'
const DESCRIPTION_LINE_HEIGHT = 22
const PROPERTY_GAP_PX = 12
const CONTENT_GAP_PX = 12
const CONTENT_MIN_HEIGHT_PX = 176
const CONTENT_TOP_PADDING_PX = 4
const CONTENT_BOTTOM_PADDING_PX = 8
const CONTENT_DESCRIPTION_LEFT_OFFSET_PX = 4
const DESCRIPTION_BOTTOM_PADDING_PX = 4
const EXPANDED_DESCRIPTION_CHROME_PX = 36
const PORTAL_TOP_LINES = 0
const PORTAL_DEFAULT_DIAMETER_PX = 200
const PORTAL_MIN_DIAMETER_PX = 152
const PORTAL_RIGHT_INSET_PX = 0
const PORTAL_TINY_RIGHT_SHIFT_PX = 6
const PORTAL_VISUAL_RIGHT_OFFSET_PX = 6
const PORTAL_WRAP_GAP_PX = 12
const PORTAL_FIELD_GAP_PX = 6
const PORTAL_CLEARANCE_PX = 4
const PORTAL_VISUAL_TOP_OFFSET_PX = 0
const PORTAL_LEFT_OCCLUSION_OVERDRAW_PX = 2
const PORTAL_RADIUS_RATIO = 0.5
const TOGGLE_FONT = '400 12px "IBM Plex Mono"'
const COLLAPSED_MORE_GAP_PX = 0
const TRUNCATION_ELLIPSIS = '...'
const EXPANDED_DESCRIPTION_BOTTOM_BUFFER_PX = 12
const LINE_START_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

let {
  feature,
  expanded = false,
  onToggle,
  onToggleVisibility,
}: {
  feature: Feature
  expanded?: boolean
  onToggle?: (expanded: boolean) => void
  onToggleVisibility?: (visible: boolean) => void
} = $props()

const appCtx = getAppCtx()
const responsiveCtx = getResponsiveCtx()
const userPreferences = $derived(appCtx.getUserPreferences())
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
  }),
)
const contentSidePaddingPx = $derived(layout.contentPaddingXPx)
const propertyContainerHorizontalPaddingPx = $derived(contentSidePaddingPx * 2)

let contentElement = $state<HTMLDivElement | null>(null)
let contentWidth = $state(0)
let contentMeasureFrame = 0

const collapsedLineCount = $derived(
  getFeatureCardCollapsedDescriptionLineCount(responsiveCtx.visibleWindowHeight),
)
const descriptionHtml = $derived(
  getI18n(feature, 'description', userPreferences, m.zany_merry_seahorse_treasure()),
)
const hasDescription = $derived(
  Boolean(
    descriptionHtml &&
      descriptionHtml !== '-' &&
      descriptionHtml !== m.zany_merry_seahorse_treasure(),
  ),
)
const descriptionPlainText = $derived(stripRichTextToPlainText(descriptionHtml))
const preparedDescriptionSegments = $derived.by(() =>
  hasDescription
    ? prepareWithSegments(descriptionPlainText, DESCRIPTION_FONT, {
        whiteSpace: 'pre-wrap',
      })
    : null,
)
const descriptionContentWidth = $derived(
  Math.max(contentWidth - contentSidePaddingPx * 2, 1),
)
const featureProperties = $derived(
  getFeatureCardDisplayProperties(appCtx, feature.layerId, feature).filter(
    (property: any) =>
      property.property?.key !== 'grade' &&
      getFPI18n(property, userPreferences) !== '-' &&
      getFPI18n(property, userPreferences) !== m.great_crazy_squid_promise(),
  ),
)
const featurePropertyItems = $derived.by((): FeaturePropertyItem[] =>
  featureProperties.map((property: any) => ({
    id: property.propertyId,
    label: getI18n(property.property, 'label', userPreferences),
    value: getFPI18n(property, userPreferences),
  })),
)
const portalRightInsetPx = $derived(
  PORTAL_RIGHT_INSET_PX + (layout.mode === 'tiny' ? -PORTAL_TINY_RIGHT_SHIFT_PX : 0),
)
const collapsedPortalGeometry = $derived.by(() =>
  buildPortalGeometry(descriptionContentWidth, portalRightInsetPx),
)
const expandedPortalGeometry = $derived.by(() =>
  buildPortalGeometry(descriptionContentWidth, portalRightInsetPx),
)
const expandedFullWidthLines = $derived.by(() => {
  if (!preparedDescriptionSegments) return []

  return layoutWithLines(
    preparedDescriptionSegments,
    descriptionContentWidth,
    DESCRIPTION_LINE_HEIGHT,
  ).lines
})
const truncationEllipsisWidth = $derived.by(() =>
  prepareWithSegments(TRUNCATION_ELLIPSIS, DESCRIPTION_FONT, {
    whiteSpace: 'pre-wrap',
  }).widths.reduce((total, width) => total + width, 0),
)
const collapsedMoreLabel = $derived('more')
const collapsedMoreWidth = $derived.by(() =>
  prepareWithSegments(collapsedMoreLabel, TOGGLE_FONT, {
    whiteSpace: 'pre-wrap',
  }).widths.reduce((total, width) => total + width, 0),
)
const adjacentPropertyRegionWidth = $derived(
  Math.max(collapsedPortalGeometry.visualLeft - PORTAL_FIELD_GAP_PX, 0),
)
const adjacentPropertyLayoutWidth = $derived(
  Math.max(adjacentPropertyRegionWidth - propertyContainerHorizontalPaddingPx, 0),
)
const portalTop = $derived(collapsedPortalGeometry.visualTop)
const portalBottom = $derived(collapsedPortalGeometry.visualBottom)
const portalHeight = $derived(collapsedPortalGeometry.visualDiameter)
const fullDescriptionLineBudget = $derived.by(() =>
  Math.max(
    expandedFullWidthLines.length +
      Math.ceil(collapsedPortalGeometry.obstacle.diameter / DESCRIPTION_LINE_HEIGHT) +
      4,
    collapsedLineCount + 2,
  ),
)
const collapsedContentPlan = $derived.by((): CollapsedContentPlan => {
  const emptyPlacement: PropertyPlacement = {
    items: [],
    layout: null,
    top: portalTop,
    width: adjacentPropertyRegionWidth,
  }

  if (!hasDescription && featurePropertyItems.length === 0) {
    return {
      descriptionLayout: { lines: [], hasMore: false },
      descriptionInteractiveHeight: 0,
      hasToggle: false,
      adjacentPlacement: emptyPlacement,
      overflowPlacement: {
        items: [],
        layout: null,
        top: portalBottom + CONTENT_GAP_PX,
        width: descriptionContentWidth,
      },
      contentHeight: Math.max(
        CONTENT_MIN_HEIGHT_PX,
        CONTENT_TOP_PADDING_PX + portalBottom + CONTENT_BOTTOM_PADDING_PX,
      ),
    }
  }

  if (!hasDescription) {
    const adjacentFit = fitFeaturePropertyLayoutInRegion(
      featurePropertyItems,
      adjacentPropertyLayoutWidth,
      portalHeight,
      featurePropertyItems.length,
      PROPERTY_GAP_PX,
    )
    const adjacentItems = featurePropertyItems.slice(0, adjacentFit.fitCount)
    const overflowItems = featurePropertyItems.slice(adjacentFit.fitCount)
    const overflowLayout =
      overflowItems.length > 0
        ? resolveOverflowFeaturePropertyLayout(
            overflowItems,
            Math.max(descriptionContentWidth - propertyContainerHorizontalPaddingPx, 0),
            PROPERTY_GAP_PX,
          )
        : null
    const overflowTop = portalBottom + CONTENT_GAP_PX
    const contentBottom =
      overflowLayout && overflowItems.length > 0
        ? overflowTop + overflowLayout.totalHeight
        : portalBottom

    return {
      descriptionLayout: { lines: [], hasMore: false },
      descriptionInteractiveHeight: 0,
      hasToggle: false,
      adjacentPlacement: {
        items: adjacentItems,
        layout: adjacentFit.layout,
        top: portalTop,
        width: adjacentPropertyRegionWidth,
      },
      overflowPlacement: {
        items: overflowItems,
        layout: overflowLayout,
        top: overflowTop,
        width: descriptionContentWidth,
      },
      contentHeight: Math.max(
        CONTENT_MIN_HEIGHT_PX,
        CONTENT_TOP_PADDING_PX + contentBottom + CONTENT_BOTTOM_PADDING_PX,
      ),
    }
  }

  const preparedDescription = preparedDescriptionSegments
  if (!preparedDescription) {
    return {
      descriptionLayout: { lines: [], hasMore: false },
      descriptionInteractiveHeight: 0,
      hasToggle: false,
      adjacentPlacement: emptyPlacement,
      overflowPlacement: {
        items: [],
        layout: null,
        top: portalBottom + CONTENT_GAP_PX,
        width: descriptionContentWidth,
      },
      contentHeight: Math.max(
        CONTENT_MIN_HEIGHT_PX,
        CONTENT_TOP_PADDING_PX + portalBottom + CONTENT_BOTTOM_PADDING_PX,
      ),
    }
  }

  const fullDescriptionLayout = layoutRoutedDescriptionLines({
    prepared: preparedDescription,
    contentWidth: descriptionContentWidth,
    obstacle: collapsedPortalGeometry.obstacle,
    maxLines: fullDescriptionLineBudget,
  })
  const fullDescriptionBottom = getDescriptionBottom(fullDescriptionLayout)
  const shortAdjacentTop = Math.max(
    fullDescriptionBottom + CONTENT_GAP_PX + DESCRIPTION_BOTTOM_PADDING_PX,
    portalTop,
  )
  const shortAdjacentHeight = Math.max(0, portalBottom - shortAdjacentTop)
  const shortAdjacentFit = fitFeaturePropertyLayoutInRegion(
    featurePropertyItems,
    adjacentPropertyLayoutWidth,
    shortAdjacentHeight,
    featurePropertyItems.length,
    PROPERTY_GAP_PX,
  )
  const isShortComposition =
    !fullDescriptionLayout.hasMore &&
    fullDescriptionBottom <= portalBottom &&
    shortAdjacentFit.fitCount === featurePropertyItems.length

  if (isShortComposition) {
    return {
      descriptionLayout: fullDescriptionLayout,
      descriptionInteractiveHeight: fullDescriptionBottom,
      hasToggle: false,
      adjacentPlacement: {
        items: featurePropertyItems,
        layout: shortAdjacentFit.layout,
        top: shortAdjacentTop,
        width: adjacentPropertyRegionWidth,
      },
      overflowPlacement: {
        items: [],
        layout: null,
        top: portalBottom + CONTENT_GAP_PX,
        width: descriptionContentWidth,
      },
      contentHeight: Math.max(
        CONTENT_MIN_HEIGHT_PX,
        CONTENT_TOP_PADDING_PX + portalBottom + CONTENT_BOTTOM_PADDING_PX,
      ),
    }
  }

  const maxAdjacentFit = fitFeaturePropertyLayoutInRegion(
    featurePropertyItems,
    adjacentPropertyLayoutWidth,
    portalHeight,
    featurePropertyItems.length,
    PROPERTY_GAP_PX,
  )

  let adjacentCount = maxAdjacentFit.fitCount
  let adjacentLayout = maxAdjacentFit.layout
  let adjacentTop = adjacentLayout
    ? Math.max(portalTop, portalBottom - adjacentLayout.totalHeight)
    : portalBottom
  let collapsedLayout: RoutedDescriptionLayout | null = null

  for (let count = maxAdjacentFit.fitCount; count >= 0; count -= 1) {
    const candidateLayout =
      count > 0
        ? resolveFeaturePropertyLayout(
            featurePropertyItems.slice(0, count),
            adjacentPropertyLayoutWidth,
            PROPERTY_GAP_PX,
          )
        : null
    const candidateTop = candidateLayout
      ? Math.max(portalTop, portalBottom - candidateLayout.totalHeight)
      : portalBottom
    const maxTextBottom = candidateLayout
      ? candidateTop - CONTENT_GAP_PX - DESCRIPTION_BOTTOM_PADDING_PX
      : portalBottom

    if (maxTextBottom < DESCRIPTION_LINE_HEIGHT * 2) continue

    const maxLines = Math.max(2, Math.floor(maxTextBottom / DESCRIPTION_LINE_HEIGHT))
    const candidateDescription = appendTruncationEllipsis(
      layoutRoutedDescriptionLines({
        prepared: preparedDescription,
        contentWidth: descriptionContentWidth,
        obstacle: collapsedPortalGeometry.obstacle,
        maxLines,
      }),
      preparedDescription,
      truncationEllipsisWidth,
      collapsedMoreWidth + COLLAPSED_MORE_GAP_PX,
    )

    if (candidateDescription.lines.length < 2) continue

    adjacentCount = count
    adjacentLayout = candidateLayout
    adjacentTop = candidateTop
    collapsedLayout = candidateDescription
    break
  }

  const fallbackAdjacentTop = portalBottom
  const fallbackLayout =
    collapsedLayout ??
    appendTruncationEllipsis(
      layoutRoutedDescriptionLines({
        prepared: preparedDescription,
        contentWidth: descriptionContentWidth,
        obstacle: collapsedPortalGeometry.obstacle,
        maxLines: 2,
      }),
      preparedDescription,
      truncationEllipsisWidth,
      collapsedMoreWidth + COLLAPSED_MORE_GAP_PX,
    )
  const adjacentItems = featurePropertyItems.slice(0, adjacentCount)
  const overflowItems = featurePropertyItems.slice(adjacentCount)
  const overflowLayout =
    overflowItems.length > 0
      ? resolveOverflowFeaturePropertyLayout(
          overflowItems,
          Math.max(descriptionContentWidth - propertyContainerHorizontalPaddingPx, 0),
          PROPERTY_GAP_PX,
        )
      : null
  const overflowTop = portalBottom + CONTENT_GAP_PX
  const descriptionBottom = getDescriptionBottom(fallbackLayout)
  const contentBottom = Math.max(
    portalBottom,
    descriptionBottom,
    adjacentLayout ? adjacentTop + adjacentLayout.totalHeight : fallbackAdjacentTop,
    overflowLayout && overflowItems.length > 0
      ? overflowTop + overflowLayout.totalHeight
      : 0,
  )

  return {
    descriptionLayout: fallbackLayout,
    descriptionInteractiveHeight: descriptionBottom,
    hasToggle: true,
    adjacentPlacement: {
      items: adjacentItems,
      layout: adjacentLayout,
      top: adjacentLayout ? adjacentTop : fallbackAdjacentTop,
      width: adjacentPropertyRegionWidth,
    },
    overflowPlacement: {
      items: overflowItems,
      layout: overflowLayout,
      top: overflowTop,
      width: descriptionContentWidth,
    },
    contentHeight: Math.max(
      CONTENT_MIN_HEIGHT_PX,
      CONTENT_TOP_PADDING_PX + contentBottom + CONTENT_BOTTOM_PADDING_PX,
    ),
  }
})
const collapsedDescriptionLayout = $derived(collapsedContentPlan.descriptionLayout)
const visibleCollapsedDescriptionLines = $derived.by(() =>
  collapsedDescriptionLayout.lines.filter(line => line.text.trim().length > 0),
)

function measurePreparedTextWidth(text: string, font: string): number {
  if (!text) return 0

  return prepareWithSegments(text, font, {
    whiteSpace: 'pre-wrap',
  }).widths.reduce((total, width) => total + width, 0)
}

const collapsedMoreButtonPosition = $derived.by(() => {
  if (!hasCollapsedOverflow || !collapsedDescriptionLayout.hasMore) return null

  const lastLine = visibleCollapsedDescriptionLines.at(-1)
  if (!lastLine) return null

  const lastLineTextWidth = measurePreparedTextWidth(lastLine.text, DESCRIPTION_FONT)
  const inlineLeft =
    contentSidePaddingPx +
    CONTENT_DESCRIPTION_LEFT_OFFSET_PX +
    lastLineTextWidth +
    COLLAPSED_MORE_GAP_PX
  const inlineRight = inlineLeft + collapsedMoreWidth
  const lineLimit =
    contentSidePaddingPx +
    getRoutedLineWidth(
      lastLine.top,
      descriptionContentWidth,
      collapsedPortalGeometry.obstacle,
    )

  if (inlineRight > lineLimit) {
    return {
      top: CONTENT_TOP_PADDING_PX + lastLine.top + DESCRIPTION_LINE_HEIGHT,
      left: contentSidePaddingPx + CONTENT_DESCRIPTION_LEFT_OFFSET_PX,
      inline: false,
    }
  }

  return {
    top: CONTENT_TOP_PADDING_PX + lastLine.top,
    left: inlineLeft,
    inline: true,
  }
})
const collapsedInlineMoreLineTop = $derived(
  collapsedMoreButtonPosition?.inline
    ? collapsedMoreButtonPosition.top - CONTENT_TOP_PADDING_PX
    : null,
)
const collapsedDescriptionFieldOffsetPx = $derived(hasDescription ? -10 : 0)
const topPropertyRegionTop = $derived(collapsedContentPlan.adjacentPlacement.top)
const topPropertyRegionWidth = $derived(collapsedContentPlan.adjacentPlacement.width)
const topPropertyItems = $derived(collapsedContentPlan.adjacentPlacement.items)
const bottomPropertyItems = $derived(collapsedContentPlan.overflowPlacement.items)
const collapsedBottomPropertiesTop = $derived(
  CONTENT_TOP_PADDING_PX + collapsedContentPlan.overflowPlacement.top,
)
const collapsedContentHeight = $derived(collapsedContentPlan.contentHeight)
const expandedFullDescriptionLayout = $derived.by(() => {
  if (!preparedDescriptionSegments) return { lines: [], hasMore: false }

  const fullWidthLineCount = expandedFullWidthLines.length
  const portalPenaltyLines = Math.ceil(
    expandedPortalGeometry.obstacle.diameter / DESCRIPTION_LINE_HEIGHT,
  )

  return layoutRoutedDescriptionLines({
    prepared: preparedDescriptionSegments,
    contentWidth: descriptionContentWidth,
    obstacle: expandedPortalGeometry.obstacle,
    maxLines: fullWidthLineCount + portalPenaltyLines + 4,
  })
})
const expandedDescriptionContentHeight = $derived.by(() =>
  expandedFullDescriptionLayout.lines.length === 0
    ? 0
    : getDescriptionBottom(expandedFullDescriptionLayout) +
      EXPANDED_DESCRIPTION_BOTTOM_BUFFER_PX,
)
const activeContentHeight = $derived.by(() => {
  if (!expanded) return collapsedContentHeight

  return Math.max(
    collapsedContentHeight,
    expandedDescriptionContentHeight + EXPANDED_DESCRIPTION_CHROME_PX,
  )
})
const expandedViewportHeight = $derived(
  Math.max(activeContentHeight - EXPANDED_DESCRIPTION_CHROME_PX, 0),
)
const expandedDescriptionLines = $derived(expandedFullDescriptionLayout.lines)
const hasCollapsedOverflow = $derived(collapsedContentPlan.hasToggle)
const showToggle = $derived(hasDescription && (expanded || hasCollapsedOverflow))
const activePortalGeometry = $derived(
  expanded ? expandedPortalGeometry : collapsedPortalGeometry,
)

function buildPortalGeometry(
  contentWidthPx: number,
  portalRightInsetPx: number,
): PortalGeometry {
  const visualRight = Math.max(portalRightInsetPx, 0) - PORTAL_VISUAL_RIGHT_OFFSET_PX
  const availableVisualDiameter = contentWidthPx - Math.max(visualRight, 0) - 32
  const visualDiameter = Math.min(
    contentWidthPx,
    Math.max(
      PORTAL_MIN_DIAMETER_PX,
      Math.min(PORTAL_DEFAULT_DIAMETER_PX, availableVisualDiameter),
    ),
  )
  const visualLeft = Math.max(0, contentWidthPx - visualDiameter - visualRight)
  const visualTop = hasDescription
    ? PORTAL_TOP_LINES * DESCRIPTION_LINE_HEIGHT + PORTAL_VISUAL_TOP_OFFSET_PX
    : 0
  const obstacleDiameter = visualDiameter + PORTAL_CLEARANCE_PX * 2
  const obstacleLeft = Math.max(0, visualLeft - PORTAL_CLEARANCE_PX)
  const obstacleTop = Math.max(0, visualTop - PORTAL_CLEARANCE_PX)

  return {
    obstacle: {
      top: obstacleTop,
      left: obstacleLeft,
      right: contentWidthPx - obstacleLeft - obstacleDiameter,
      bottom: obstacleTop + obstacleDiameter,
      diameter: obstacleDiameter,
      radius: obstacleDiameter * PORTAL_RADIUS_RATIO,
      centerX: obstacleLeft + obstacleDiameter / 2,
      centerY: obstacleTop + obstacleDiameter / 2,
    },
    visualDiameter,
    visualLeft,
    visualTop,
    visualRight,
    visualBottom: visualTop + visualDiameter,
  }
}

function getRoutedLineWidth(
  lineTop: number,
  contentWidthPx: number,
  obstacle: FeatureCardPortalObstacle,
  reservedRightWidth = 0,
  reserveLineCount = 0,
): number {
  const lineBottom = lineTop + DESCRIPTION_LINE_HEIGHT
  const reservedWidth =
    lineTop < reserveLineCount * DESCRIPTION_LINE_HEIGHT
      ? Math.max(1, contentWidthPx - reservedRightWidth)
      : contentWidthPx

  if (lineBottom <= obstacle.top || lineTop >= obstacle.bottom) {
    return reservedWidth
  }

  // Route against the narrowest safe slice across the whole line box, not just
  // the midpoint, so ascenders/descenders cannot clip through the portal edge.
  const nearestYToCenter = Math.min(Math.max(obstacle.centerY, lineTop), lineBottom)
  const deltaY = Math.abs(nearestYToCenter - obstacle.centerY)
  if (deltaY >= obstacle.radius) return reservedWidth

  const chordHalfWidth = Math.sqrt(obstacle.radius * obstacle.radius - deltaY * deltaY)
  const circleLeft = obstacle.centerX - chordHalfWidth

  return Math.max(
    1,
    Math.min(Math.floor(circleLeft - PORTAL_WRAP_GAP_PX), reservedWidth),
  )
}

function getDescriptionBottom(routedLayout: RoutedDescriptionLayout): number {
  const lastLine = routedLayout.lines.at(-1)
  return lastLine ? lastLine.top + DESCRIPTION_LINE_HEIGHT : 0
}

function layoutRoutedDescriptionLines(params: {
  prepared: PreparedTextWithSegments
  contentWidth: number
  obstacle: FeatureCardPortalObstacle
  startCursor?: LayoutCursor
  maxLines: number
  initialTop?: number
  reservedRightWidth?: number
  reserveLineCount?: number
}): RoutedDescriptionLayout {
  const {
    prepared,
    contentWidth: contentWidthPx,
    obstacle,
    startCursor = LINE_START_CURSOR,
    maxLines,
    initialTop = 0,
    reservedRightWidth = 0,
    reserveLineCount = 0,
  } = params

  const lines: RoutedDescriptionLayout['lines'] = []
  let cursor = startCursor
  let lineTop = initialTop

  for (let index = 0; index < maxLines; index += 1) {
    const lineWidth = getRoutedLineWidth(
      lineTop,
      contentWidthPx,
      obstacle,
      reservedRightWidth,
      reserveLineCount,
    )
    const nextLine = layoutNextLine(prepared, cursor, lineWidth)

    if (!nextLine) return { lines, hasMore: false }

    lines.push({
      text: nextLine.text,
      top: lineTop,
      width: lineWidth,
      start: cursor,
      end: nextLine.end,
    })
    cursor = nextLine.end
    lineTop += DESCRIPTION_LINE_HEIGHT
  }

  return {
    lines,
    hasMore:
      layoutNextLine(
        prepared,
        cursor,
        getRoutedLineWidth(
          lineTop,
          contentWidthPx,
          obstacle,
          reservedRightWidth,
          reserveLineCount,
        ),
      ) !== null,
  }
}

function appendTruncationEllipsis(
  routedLayout: RoutedDescriptionLayout,
  prepared: PreparedTextWithSegments,
  ellipsisWidth: number,
  trailingReservedWidth = 0,
): RoutedDescriptionLayout {
  if (!routedLayout.hasMore || routedLayout.lines.length === 0) return routedLayout

  const lines = [...routedLayout.lines]
  let index = lines.length - 1

  while (index >= 0) {
    const line = lines[index]
    if (!line) break

    const truncatedLineWidth = Math.max(
      1,
      line.width - ellipsisWidth - trailingReservedWidth,
    )
    const truncatedLine = layoutNextLine(prepared, line.start, truncatedLineWidth)
    const truncatedText = truncatedLine?.text.trim() ?? ''

    if (!truncatedLine || truncatedText.length === 0) {
      lines.pop()
      index -= 1
      continue
    }

    lines[index] = {
      text: truncatedLine.text,
      top: line.top,
      width: truncatedLineWidth,
      start: line.start,
      end: truncatedLine.end,
      appendEllipsis: true,
    }
    lines.length = index + 1
    return { ...routedLayout, lines }
  }

  return { ...routedLayout, lines: [] }
}

onMount(() => {
  const observer = new ResizeObserver(() => {
    if (contentMeasureFrame) return

    contentMeasureFrame = requestAnimationFrame(() => {
      contentMeasureFrame = 0
      contentWidth = contentElement?.clientWidth ?? 0
    })
  })

  if (contentElement) observer.observe(contentElement)

  return () => {
    if (contentMeasureFrame) cancelAnimationFrame(contentMeasureFrame)
    observer.disconnect()
  }
})

$effect(() => {
  onToggleVisibility?.(showToggle)
})
</script>

<div
  bind:this={contentElement}
  class="pointer-events-none relative min-h-0 w-full flex-1 overflow-hidden"
  style={`height: ${activeContentHeight}px; min-height: ${activeContentHeight}px;`}
>
  <div class="pointer-events-none relative h-full w-full overflow-hidden">
    <div
      class="pointer-events-auto absolute inset-x-0 top-0 z-20 bg-black"
      style={`height: ${CONTENT_TOP_PADDING_PX + activePortalGeometry.visualTop}px;`}
    ></div>
    <div
      class="pointer-events-auto absolute right-0 top-0 z-20 bg-black"
      style={`width: ${contentSidePaddingPx + activePortalGeometry.visualRight}px; height: ${activeContentHeight}px;`}
    ></div>
    <div
      class="pointer-events-auto absolute z-20 bg-black"
      style={`top: ${CONTENT_TOP_PADDING_PX + activePortalGeometry.visualTop}px; left: 0; width: ${contentSidePaddingPx + activePortalGeometry.visualLeft + PORTAL_LEFT_OCCLUSION_OVERDRAW_PX}px; height: ${activePortalGeometry.visualDiameter}px;`}
    ></div>
    <div
      class="pointer-events-auto absolute inset-x-0 z-20 bg-black"
      style={`top: ${CONTENT_TOP_PADDING_PX + activePortalGeometry.visualBottom - 1}px; height: ${Math.max(activeContentHeight - (CONTENT_TOP_PADDING_PX + activePortalGeometry.visualBottom) + 1, 0)}px;`}
    ></div>

    <div
      class="pointer-events-none absolute z-10"
      style={`top: ${CONTENT_TOP_PADDING_PX + activePortalGeometry.visualTop}px; right: ${contentSidePaddingPx + activePortalGeometry.visualRight}px; width: ${activePortalGeometry.visualDiameter}px; height: ${activePortalGeometry.visualDiameter}px;`}
    >
      <FeatureCardContentPortal {feature} size={activePortalGeometry.visualDiameter} />
    </div>

    {#if hasDescription && !expanded}
      <div class="pointer-events-none absolute inset-x-0 top-0 z-30">
        {#each visibleCollapsedDescriptionLines as line, index (`collapsed-${index}-${line.top}`)}
          <div
            class="absolute left-0 h-[22px] overflow-hidden whitespace-pre-wrap break-words text-[0.9375rem] font-light leading-[22px] tracking-tight text-gray-300"
            style={`top: ${CONTENT_TOP_PADDING_PX + line.top}px; left: ${contentSidePaddingPx + CONTENT_DESCRIPTION_LEFT_OFFSET_PX}px; width: ${line.width}px;`}
          >
            {line.text}
            {line.appendEllipsis && collapsedInlineMoreLineTop !== line.top
              ? TRUNCATION_ELLIPSIS
              : ''}
          </div>
        {/each}
      </div>

      {#if collapsedMoreButtonPosition}
        <button
          type="button"
          class="pointer-events-auto absolute z-40 whitespace-nowrap bg-transparent font-mono text-sm text-primary transition-opacity hover:opacity-80 leading-[23px]"
          style={`top: ${collapsedMoreButtonPosition.top}px; left: ${collapsedMoreButtonPosition.left}px;`}
          aria-label={collapsedMoreLabel}
          onclick={() => onToggle?.(true)}
        >
          {collapsedMoreLabel}
        </button>
      {/if}
    {/if}

    {#if !expanded && topPropertyItems.length > 0}
      <div
        class="pointer-events-none absolute z-30"
        style={`top: ${CONTENT_TOP_PADDING_PX + topPropertyRegionTop + collapsedDescriptionFieldOffsetPx}px; left: 0; width: ${topPropertyRegionWidth}px;`}
      >
        <FeatureCardContentFields {feature} items={topPropertyItems} />
      </div>
    {/if}

    {#if !expanded && bottomPropertyItems.length > 0}
      <div
        class="pointer-events-none absolute inset-x-0 z-30"
        style={`top: ${collapsedBottomPropertiesTop}px;`}
      >
        <FeatureCardContentFields {feature} items={bottomPropertyItems} />
      </div>
    {/if}
  </div>

  {#if expanded && hasDescription}
    <div
      class="pointer-events-none absolute inset-0 z-30"
      style={`padding-left: ${contentSidePaddingPx + CONTENT_DESCRIPTION_LEFT_OFFSET_PX}px; padding-right: ${contentSidePaddingPx}px;`}
    >
      <div
        class="pointer-events-none relative pr-1"
        style={`height: ${expandedViewportHeight}px;`}
      >
        <div
          class="pointer-events-none relative"
          style={`height: ${expandedDescriptionContentHeight}px;`}
        >
          {#each expandedDescriptionLines as line, index (`expanded-${index}-${line.top}`)}
            <div
              class="pointer-events-none absolute left-0 h-[22px] overflow-hidden whitespace-pre-wrap break-words text-[0.9375rem] font-light leading-[22px] tracking-tight text-gray-300"
              style={`top: ${CONTENT_TOP_PADDING_PX + line.top}px; width: ${line.width}px;`}
            >
              {line.text}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
