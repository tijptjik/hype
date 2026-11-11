<script lang="ts">
// TRANSLATION
import { requestAutomaticPropertyTranslations } from '#lib/client/services/automaticTranslations.js'
import { resolveContentField } from '#lib/i18n/automatic.js'
import { getLocale } from '#lib/i18n.js'
import AutomaticTranslationIndicator from '#lib/bits/custom/text/AutomaticTranslationIndicator.svelte'
// SVELTE
import { onMount, tick } from 'svelte'
import { fly } from 'svelte/transition'
import { cubicOut } from 'svelte/easing'
import { MediaQuery } from 'svelte/reactivity'
// THIRD PARTY
import {
  layoutNextLine,
  layoutWithLines,
  measureNaturalWidth,
  prepare,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
// SERVICES
import { getFeatureCardDisplayProperties } from '#lib/client/services/property.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import {
  getSurfaceLayoutCtx,
  SurfaceLayout,
} from '#lib/context/surfaceLayout.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
// I18N
import { getFeaturePropertyDisplay, getFPI18n, getI18n, m } from '#lib/i18n.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { FeatureCardPortalObstacle } from '#lib/context/featureCard.types.js'
import type { PropertyLayoutResult } from '../featureCard.types'
// LOCAL
import {
  VIEWER_TRANSITION_MS,
  VIEWER_TRANSITION_EASING,
} from '#lib/bits/patterns/images/images.motion.js'
import {
  fitFeaturePropertyLayoutInRegion,
  getFeatureCardCollapsedDescriptionLineCount,
  getFeatureCardLayout,
  resolveOverflowFeaturePropertyLayout,
  resolveFeaturePropertyLayout,
  stripRichTextToPlainText,
} from '../featureCard.layout'
import { getFeatureCardResponsiveWidth } from '../featureCard.utils'
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
const DESCRIPTION_TOGGLE_GAP_PX = 8
let toggleWidth = $state(80)
let collapsedLastTextWidth = $state(0)
let expandedLastTextWidth = $state(0)
const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)')
let motionFeatureId = $state<string | null>(null)
let toggleElement: HTMLButtonElement | undefined = $state()
let toggleAnimation: Animation | undefined
let toggleGeneration = 0
const TRUNCATION_ELLIPSIS = '…'
const EXPANDED_DESCRIPTION_BOTTOM_BUFFER_PX = 12
const LINE_START_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

let {
  feature,
  expanded = false,
  onToggle,
  titleInsetPx = 0,
  onTitleSpaceChange,
  onLayoutReadyChange,
}: {
  feature: Feature
  expanded?: boolean
  onToggle?: (expanded: boolean) => void
  titleInsetPx?: number
  onTitleSpaceChange?: (width: number) => void
  onLayoutReadyChange?: (ready: boolean) => void
} = $props()

// Motion belongs to an explicit toggle on this feature, never navigation or sizing.
const motionDuration = $derived(
  !reducedMotion.current && motionFeatureId === feature.id ? VIEWER_TRANSITION_MS : 0,
)
const descriptionMotion = $derived({
  y: -12,
  duration: motionDuration,
  easing: cubicOut,
})

/**
 * Fades the trigger in place, then reveals it at the settled inline destination.
 * @returns Resolves after the same-feature toggle animation completes.
 * @remarks Navigation cancels pending work; reduced motion changes state immediately.
 */
async function toggleDescription(): Promise<void> {
  if (toggleAnimation) return
  if (reducedMotion.current || !toggleElement) {
    onToggle?.(!expanded)
    return
  }
  const generation = ++toggleGeneration
  const button = toggleElement
  try {
    toggleAnimation = button.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 90,
      fill: 'forwards',
      easing: 'ease-out',
    })
    await toggleAnimation.finished
    if (generation !== toggleGeneration) return

    motionFeatureId = feature.id
    onToggle?.(!expanded)
    await tick()
    // Keep the trigger invisible while the body moves and final text widths settle.
    await new Promise(resolve => setTimeout(resolve, VIEWER_TRANSITION_MS + 30))
    if (generation !== toggleGeneration || !button.isConnected) return
    motionFeatureId = null
    toggleAnimation.cancel()
    toggleAnimation = button.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 140,
      easing: 'ease-out',
    })
    await toggleAnimation.finished
  } catch {
    // Canceling a Web Animation during navigation rejects its finished promise.
  } finally {
    if (generation === toggleGeneration) {
      toggleAnimation?.cancel()
      toggleAnimation = undefined
    }
  }
}

$effect(() => {
  feature.id
  motionFeatureId = null
  toggleGeneration += 1
  toggleAnimation?.cancel()
  toggleAnimation = undefined
})

const appCtx = getSurfaceCtx()
const responsiveCtx = getResponsiveCtx()
const surfaceLayout = getSurfaceLayoutCtx() ?? new SurfaceLayout(responsiveCtx)
const userPreferences = $derived(appCtx.getUserPreferences())
const responsiveWidth = $derived(
  getFeatureCardResponsiveWidth(responsiveCtx, surfaceLayout),
)
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
    responsiveWidth,
  }),
)
const contentSidePaddingPx = $derived(layout.contentPaddingXPx)
// Keep property fields aligned with the description's visual left edge.
const propertyContainerHorizontalPaddingPx = $derived(
  contentSidePaddingPx * 2 + CONTENT_DESCRIPTION_LEFT_OFFSET_PX,
)

let contentElement = $state<HTMLDivElement | null>(null)
let contentWidth = $state(0)
let contentMeasureFrame = 0

const collapsedLineCount = $derived(
  getFeatureCardCollapsedDescriptionLineCount(responsiveCtx.visibleWindowHeight),
)
const descriptionResolution = $derived(
  resolveContentField(
    feature.i18n ?? {},
    'description',
    userPreferences.contentLocale ?? getLocale(),
    userPreferences.allowMachineTranslation,
  ),
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
    property =>
      property.property?.key !== 'grade' &&
      getFPI18n(property, userPreferences) !== '-' &&
      getFPI18n(property, userPreferences) !== m.great_crazy_squid_promise(),
  ),
)
$effect(() => {
  if (!userPreferences.allowMachineTranslation) return
  for (const row of featureProperties) {
    if (row.property)
      void requestAutomaticPropertyTranslations(
        appCtx,
        row.property,
        userPreferences.contentLocale ?? getLocale(),
      )
  }
})
const featurePropertyItems = $derived.by((): FeaturePropertyItem[] => {
  const items = featureProperties.map(property => ({
    id: property.propertyId,
    label: getI18n(property.property, 'label', userPreferences),
    labelResolution: resolveContentField(
      property.property?.i18n ?? {},
      'label',
      userPreferences.contentLocale ?? getLocale(),
      userPreferences.allowMachineTranslation,
    ),
    valueResolution: resolveContentField(
      property.property?.type === 'classifier'
        ? (property.property.values?.find(
            value => value.id === property.propertyValueId,
          )?.i18n ?? {})
        : (property.i18n ?? {}),
      'value',
      userPreferences.contentLocale ?? getLocale(),
      userPreferences.allowMachineTranslation,
    ),
    value:
      property.property?.dataType === 'link'
        ? (() => {
            const display = getFeaturePropertyDisplay(property, userPreferences)
            return display.kind === 'links'
              ? display.links
                  .map((link, index) =>
                    display.numbered ? `${index + 1} ↗` : `${link.label} ↗`,
                  )
                  .join('  ')
              : getFPI18n(property, userPreferences)
          })()
        : getFPI18n(property, userPreferences),
    display: getFeaturePropertyDisplay(property, userPreferences),
  }))
  // MTR access belongs to the future Breadline-specific card, not default cards.
  return items
})
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
  measurePreparedTextWidth(TRUNCATION_ELLIPSIS, DESCRIPTION_FONT),
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
      Math.max(0, portalHeight - titleInsetPx),
      featurePropertyItems.length,
      PROPERTY_GAP_PX,
    )
    const adjacentItems = featurePropertyItems.slice(0, adjacentFit.fitCount)
    const overflowItems = featurePropertyItems.slice(adjacentFit.fitCount)
    // Relax the title gap only into unused space beside the portal, without
    // increasing the card height or pushing any properties into overflow.
    const adjacentTop = Math.max(portalTop, titleInsetPx)
    const spareHeight = Math.max(
      0,
      portalBottom - adjacentTop - (adjacentFit.layout?.totalHeight ?? 0),
    )
    const titleGapExtra = Math.min(CONTENT_GAP_PX, spareHeight)
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
        top: adjacentTop + titleGapExtra,
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
    // Give a complete description breathing room before its properties when
    // the portal leaves spare height, preserving the existing card budget.
    const spareHeight = Math.max(
      0,
      shortAdjacentHeight - (shortAdjacentFit.layout?.totalHeight ?? 0),
    )
    const descriptionGapExtra = Math.min(CONTENT_GAP_PX, spareHeight)
    return {
      descriptionLayout: fullDescriptionLayout,
      descriptionInteractiveHeight: fullDescriptionBottom,
      hasToggle: false,
      adjacentPlacement: {
        items: featurePropertyItems,
        layout: shortAdjacentFit.layout,
        top: shortAdjacentTop + descriptionGapExtra,
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
    Math.max(0, portalHeight - titleInsetPx),
    featurePropertyItems.length,
    PROPERTY_GAP_PX,
  )

  let adjacentCount = maxAdjacentFit.fitCount
  let adjacentLayout = maxAdjacentFit.layout
  let adjacentTop = adjacentLayout
    ? Math.max(portalTop, titleInsetPx, portalBottom - adjacentLayout.totalHeight)
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
      ? Math.max(portalTop, titleInsetPx, portalBottom - candidateLayout.totalHeight)
      : portalBottom
    const maxTextBottom = candidateLayout
      ? candidateTop - CONTENT_GAP_PX - DESCRIPTION_BOTTOM_PADDING_PX
      : portalBottom

    if (maxTextBottom - titleInsetPx < DESCRIPTION_LINE_HEIGHT * 2) continue

    const maxLines = Math.max(
      2,
      Math.floor((maxTextBottom - titleInsetPx) / DESCRIPTION_LINE_HEIGHT),
    )
    const candidateDescription = appendTruncationEllipsis(
      layoutRoutedDescriptionLines({
        prepared: preparedDescription,
        contentWidth: descriptionContentWidth,
        obstacle: collapsedPortalGeometry.obstacle,
        maxLines,
      }),
      preparedDescription,
      truncationEllipsisWidth,
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
const lastTextWidth = $derived(
  expanded ? expandedLastTextWidth : collapsedLastTextWidth,
)
const collapsedDescriptionLayout = $derived(collapsedContentPlan.descriptionLayout)
const visibleCollapsedDescriptionLines = $derived.by(() =>
  collapsedDescriptionLayout.lines.filter(line => line.text.trim().length > 0),
)

function measurePreparedTextWidth(text: string, font: string): number {
  if (!text) return 0

  return measureNaturalWidth(prepare(text, font, { whiteSpace: 'pre-wrap' }))
}

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

  const result = layoutRoutedDescriptionLines({
    prepared: preparedDescriptionSegments,
    contentWidth: descriptionContentWidth,
    obstacle: expandedPortalGeometry.obstacle,
    maxLines: fullWidthLineCount + portalPenaltyLines + 4,
  })
  // Reflow the final words when the inline control needs room; retain every
  // cursor segment so expanding never drops or rewrites description text.
  const lines = [...result.lines]
  while (lines.length && !lines.at(-1)?.text.trim()) lines.pop()
  const last = lines.at(-1)
  if (!last) return result
  const reserved =
    toggleWidth +
    DESCRIPTION_TOGGLE_GAP_PX +
    (descriptionResolution.kind === 'automatic' ? 32 : 0)
  if (
    measurePreparedTextWidth(last.text.trimEnd(), DESCRIPTION_FONT) + reserved <=
    last.width
  ) {
    return { ...result, lines }
  }
  lines.pop()
  let cursor = last.start
  let top = last.top
  while (true) {
    const width = getRoutedLineWidth(
      top,
      descriptionContentWidth,
      expandedPortalGeometry.obstacle,
    )
    const next = layoutNextLine(
      preparedDescriptionSegments,
      Math.max(1, width - reserved),
      cursor,
    )
    if (!next) break
    lines.push({ text: next.text, top, width, start: cursor, end: next.end })
    cursor = next.end
    top += DESCRIPTION_LINE_HEIGHT
  }
  return { ...result, lines }
})
const expandedDescriptionContentHeight = $derived.by(() =>
  expandedFullDescriptionLayout.lines.length === 0
    ? 0
    : getDescriptionBottom(expandedFullDescriptionLayout) +
      EXPANDED_DESCRIPTION_BOTTOM_BUFFER_PX,
)
// Keep expanded fields below both the full description and the location portal.
const expandedPropertiesTop = $derived(
  CONTENT_TOP_PADDING_PX +
    Math.max(expandedDescriptionContentHeight, expandedPortalGeometry.visualBottom) +
    CONTENT_GAP_PX,
)
const expandedPropertyLayout = $derived(
  resolveFeaturePropertyLayout(
    featurePropertyItems,
    Math.max(descriptionContentWidth - propertyContainerHorizontalPaddingPx, 0),
    PROPERTY_GAP_PX,
  ),
)
const activeContentHeight = $derived.by(() => {
  if (!expanded) return collapsedContentHeight

  return Math.max(
    collapsedContentHeight,
    expandedDescriptionContentHeight + EXPANDED_DESCRIPTION_CHROME_PX,
    featurePropertyItems.length > 0
      ? expandedPropertiesTop +
          expandedPropertyLayout.totalHeight +
          CONTENT_BOTTOM_PADDING_PX
      : 0,
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
    initialTop = titleInsetPx,
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
    const nextLine = layoutNextLine(prepared, lineWidth, cursor)

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
        getRoutedLineWidth(
          lineTop,
          contentWidthPx,
          obstacle,
          reservedRightWidth,
          reserveLineCount,
        ),
        cursor,
      ) !== null,
  }
}

function appendTruncationEllipsis(
  routedLayout: RoutedDescriptionLayout,
  prepared: PreparedTextWithSegments,
  ellipsisWidth: number,
): RoutedDescriptionLayout {
  if (!routedLayout.hasMore || routedLayout.lines.length === 0) return routedLayout

  const lines = [...routedLayout.lines]
  let index = lines.length - 1

  while (index >= 0) {
    const line = lines[index]
    if (!line) break

    const truncatedLineWidth = Math.max(
      1,
      line.width -
        ellipsisWidth -
        toggleWidth -
        DESCRIPTION_TOGGLE_GAP_PX -
        (descriptionResolution.kind === 'automatic' ? 32 : 0),
    )
    const truncatedLine = layoutNextLine(prepared, truncatedLineWidth, line.start)
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
    toggleGeneration += 1
    toggleAnimation?.cancel()
    if (contentMeasureFrame) cancelAnimationFrame(contentMeasureFrame)
    observer.disconnect()
  }
})

// Reserve a rectangular title slot beside the circle, including its wrap gap.
$effect(() => {
  onTitleSpaceChange?.(
    contentSidePaddingPx + collapsedPortalGeometry.visualLeft - PORTAL_WRAP_GAP_PX,
  )
})

// The first render uses a placeholder width; do not budget the gallery from it.
$effect(() => {
  onLayoutReadyChange?.(contentWidth > 0)
  return () => onLayoutReadyChange?.(false)
})
</script>

<div
  bind:this={contentElement}
  class="pointer-events-none relative min-h-0 w-full flex-1 overflow-hidden transition-[height,min-height] motion-reduce:transition-none"
  style={`height: ${activeContentHeight}px; min-height: ${activeContentHeight}px; transition-duration: ${motionDuration}ms; transition-timing-function: ${VIEWER_TRANSITION_EASING};`}
>
  <div class="pointer-events-none relative h-full w-full overflow-hidden">
    <div
      class="pointer-events-auto absolute inset-x-0 top-0 z-20 bg-(--theme-panel)"
      style={`height: ${CONTENT_TOP_PADDING_PX + activePortalGeometry.visualTop}px;`}
    ></div>
    <div
      class="pointer-events-auto absolute top-0 right-0 z-20 bg-(--theme-panel)"
      style={`width: ${contentSidePaddingPx + activePortalGeometry.visualRight}px; height: ${activeContentHeight}px;`}
    ></div>
    <div
      class="pointer-events-auto absolute z-20 bg-(--theme-panel)"
      style={`top: ${CONTENT_TOP_PADDING_PX + activePortalGeometry.visualTop}px; left: 0; width: ${contentSidePaddingPx + activePortalGeometry.visualLeft + PORTAL_LEFT_OCCLUSION_OVERDRAW_PX}px; height: ${activePortalGeometry.visualDiameter}px;`}
    ></div>
    <div
      class="pointer-events-auto absolute inset-x-0 z-20 bg-(--theme-panel)"
      style={`top: ${CONTENT_TOP_PADDING_PX + activePortalGeometry.visualBottom - 1}px; height: ${Math.max(activeContentHeight - (CONTENT_TOP_PADDING_PX + activePortalGeometry.visualBottom) + 1, 0)}px;`}
    ></div>

    <div
      class="pointer-events-none absolute z-10"
      style={`top: ${CONTENT_TOP_PADDING_PX + activePortalGeometry.visualTop}px; right: ${contentSidePaddingPx + activePortalGeometry.visualRight}px; width: ${activePortalGeometry.visualDiameter}px; height: ${activePortalGeometry.visualDiameter}px;`}
    >
      <FeatureCardContentPortal {feature} size={activePortalGeometry.visualDiameter} />
    </div>

    {#if hasDescription && !expanded}
      <div
        transition:fly={descriptionMotion}
        class="pointer-events-none absolute inset-x-0 top-0 z-30"
        style={`height: ${collapsedContentPlan.descriptionInteractiveHeight}px;`}
      >
        {#each visibleCollapsedDescriptionLines as line, index (`collapsed-${index}-${line.top}`)}
          <span
            class="text-muted-foreground absolute left-0 h-[22px] overflow-hidden text-[0.9375rem] leading-[22px] font-light tracking-tight break-words whitespace-pre-wrap"
            style={`top: ${CONTENT_TOP_PADDING_PX + line.top}px; left: ${contentSidePaddingPx + CONTENT_DESCRIPTION_LEFT_OFFSET_PX}px; width: ${line.width}px;`}
          >
            {#if index === visibleCollapsedDescriptionLines.length - 1}
              <span class="inline-block" bind:clientWidth={collapsedLastTextWidth}
                >{line.text.trimEnd()}{line.appendEllipsis
                  ? TRUNCATION_ELLIPSIS
                  : ''}</span
              >
            {:else}
              {line.text}
            {/if}
          </span>
        {/each}
      </div>
    {/if}

    {#if !expanded && topPropertyItems.length > 0}
      <div
        transition:fly={{
          ...descriptionMotion,
          y:
            expandedPropertiesTop -
            CONTENT_TOP_PADDING_PX -
            topPropertyRegionTop -
            collapsedDescriptionFieldOffsetPx,
        }}
        class="pointer-events-none absolute z-30"
        style={`top: ${CONTENT_TOP_PADDING_PX + topPropertyRegionTop + collapsedDescriptionFieldOffsetPx}px; left: 0; width: ${topPropertyRegionWidth}px;`}
      >
        <FeatureCardContentFields {feature} items={topPropertyItems} />
      </div>
    {/if}

    {#if !expanded && bottomPropertyItems.length > 0}
      <div
        transition:fly={descriptionMotion}
        class="pointer-events-none absolute inset-x-0 z-30"
        style={`top: ${collapsedBottomPropertiesTop}px;`}
      >
        <FeatureCardContentFields {feature} items={bottomPropertyItems} />
      </div>
    {/if}
  </div>

  {#if expanded && featurePropertyItems.length > 0}
    <div
      transition:fly={{
        ...descriptionMotion,
        y:
          CONTENT_TOP_PADDING_PX +
          topPropertyRegionTop +
          collapsedDescriptionFieldOffsetPx -
          expandedPropertiesTop,
      }}
      class="pointer-events-none absolute inset-x-0 z-30"
      style={`top: ${expandedPropertiesTop}px;`}
    >
      <FeatureCardContentFields {feature} items={featurePropertyItems} />
    </div>
  {/if}

  {#if expanded && hasDescription}
    <div
      transition:fly={descriptionMotion}
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
              class="text-muted-foreground pointer-events-none absolute left-0 h-[22px] overflow-hidden text-[0.9375rem] leading-[22px] font-light tracking-tight break-words whitespace-pre-wrap"
              style={`top: ${CONTENT_TOP_PADDING_PX + line.top}px; width: ${line.width}px;`}
            >
              {#if index === expandedDescriptionLines.length - 1}
                <span class="inline-block" bind:clientWidth={expandedLastTextWidth}
                  >{line.text.trimEnd()}</span
                >
              {:else}
                {line.text}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
  {#if hasDescription && descriptionResolution.kind === 'automatic'}
    <div
      class="pointer-events-auto absolute z-40"
      style={`top: ${CONTENT_TOP_PADDING_PX + ((expanded ? expandedDescriptionLines : visibleCollapsedDescriptionLines).at(-1)?.top ?? 0)}px; left: ${contentSidePaddingPx + CONTENT_DESCRIPTION_LEFT_OFFSET_PX + lastTextWidth + DESCRIPTION_TOGGLE_GAP_PX + (showToggle ? toggleWidth + DESCRIPTION_TOGGLE_GAP_PX : 0)}px;`}
    >
      <AutomaticTranslationIndicator resolution={descriptionResolution} />
    </div>
  {/if}
  {#if showToggle}
    <!-- Reserve inline width during layout and anchor to the rendered final words. -->
    <button
      type="button"
      bind:this={toggleElement}
      bind:clientWidth={toggleWidth}
      class="text-primary focus-visible:outline-primary pointer-events-auto absolute z-40 flex h-[22px] items-center rounded-sm text-sm font-medium whitespace-nowrap underline decoration-current/50 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2"
      style={`top: ${CONTENT_TOP_PADDING_PX + ((expanded ? expandedDescriptionLines : visibleCollapsedDescriptionLines).at(-1)?.top ?? 0)}px; left: ${contentSidePaddingPx + CONTENT_DESCRIPTION_LEFT_OFFSET_PX + lastTextWidth + DESCRIPTION_TOGGLE_GAP_PX}px;`}
      aria-expanded={expanded}
      onclick={toggleDescription}
    >
      {expanded ? m.common__read_less() : m.common__read_more()}
    </button>
  {/if}
</div>
