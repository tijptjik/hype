<script lang="ts">
// BREADLINE
import BreadlineCardContent from './components/BreadlineCardContent.svelte'
import OrganisationOnboarding from '#lib/bits/patterns/organisationUsers/OrganisationOnboarding.svelte'
import type { BreadlineRunPresentation } from '#lib/features/breadlineCard.js'
// BITS
import FeatureCardShareAction from './components/FeatureCardShareAction.svelte'
import FeatureCardAddPhotoBody from './components/FeatureCardAddPhotoBody.svelte'
import FeatureCardActions from './components/FeatureCardActions.svelte'
import FeatureCardBreadcrumbs from './components/FeatureCardBreadcrumbs.svelte'
import FeatureCardContainer from './components/FeatureCardContainer.svelte'
import {
  VIEWER_TRANSITION_MS,
  VIEWER_TRANSITION_EASING,
} from '#lib/bits/patterns/images/images.motion.js'
import FeatureCardContent from './components/FeatureCardContent.svelte'
import FeatureCardPortalBand from './components/FeatureCardPortalBand.svelte'
import FeatureCardMissingReportBody from './components/FeatureCardMissingReportBody.svelte'
import FeatureCardRoot from './components/FeatureCardRoot.svelte'
import FeatureCardTitle from './components/FeatureCardTitle.svelte'
import FeatureCardViewerContent from './components/FeatureCardViewerContent.svelte'
import * as FeatureCardActionPrimitive from './components/actions'
import * as FeatureCardNewPrimitive from './components/newFeature'
// CONTEXT
import { getCardCtx } from '#lib/context/card.svelte.js'
import { getOmniCtx } from '#lib/context/omni.svelte.js'
import {
  getSurfaceLayoutCtx,
  SurfaceLayout,
} from '#lib/context/surfaceLayout.svelte.js'
import { getResponsiveCtx, setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// ENUMS
import { FeatureCardMode } from '#lib/enums.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { FeatureCardType } from '#lib/features/cardType.js'
// LOCAL
import { getFeatureCardLayout } from './featureCard.layout'
import { getFeatureCardResponsiveWidth } from './featureCard.utils'

type FeatureCardProps = {
  feature: Feature
  cardType?: FeatureCardType
  breadlineRun?: BreadlineRunPresentation
}

let { feature, cardType = 'standard', breadlineRun }: FeatureCardProps = $props()

const cardCtx = getCardCtx()
const omniCtx = getOmniCtx()
// HMR can temporarily remount this subtree before the root layout context is
// rebound. Fall back to a local responsive context so the card can recover.
const responsiveCtx = (() => {
  try {
    return getResponsiveCtx()
  } catch {
    return setResponsiveCtx()
  }
})()
const surfaceLayout = getSurfaceLayoutCtx() ?? new SurfaceLayout(responsiveCtx)
const mode = $derived(cardCtx.state.mode)
const isPortalBand = $derived(cardType === 'portal-band' && cardCtx.isDisplayMode)
const responsiveWidth = $derived(
  getFeatureCardResponsiveWidth(responsiveCtx, surfaceLayout),
)
// The action row must fit the current app-main space, including any open panels.
const isFeatureActionIconOnly = $derived(surfaceLayout.getEffectiveAppMainWidth() < 620)
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
    responsiveWidth,
  }),
)
// Let narrow display cards give space back to the portal before scrolling. The
// viewer still grows into the available budget on taller screens.
const preferredViewerMinHeightPx = $derived(
  cardCtx.isDisplayMode && responsiveWidth < 768 && !cardCtx.shareTarget
    ? Math.min(layout.viewerMinHeightPx, 200)
    : layout.viewerMinHeightPx,
)
let viewerFitReductionPx = $state(0)
const viewerMinHeightPx = $derived(preferredViewerMinHeightPx - viewerFitReductionPx)

let viewport = $state<HTMLElement>()
let cardContentWidth = $state(0)
let portalBandHeight = $state(64)
const bandPortalSize = $derived(cardContentWidth < 480 ? 120 : 160)
// The circle ends at the title row; it must not add space above the actions.
const bandPortalCenterY = $derived(portalBandHeight - bandPortalSize / 2 - 4)
let isDescriptionExpanded = $state(false)
let viewerShellElement = $state<HTMLDivElement | null>(null)
let breadcrumbsElement = $state<HTMLDivElement | null>(null)
let titleElement = $state<HTMLDivElement | null>(null)
let titleSpaceWidthPx = $state(0)
let titleOverlapPx = $state(0)
let committedTitleOverlapPx = $state(0)
let pendingViewerBudgetKey = ''
let contentLayoutReady = $state(false)
let contentShellElement = $state<HTMLDivElement | null>(null)
let validationElement = $state<HTMLDivElement | null>(null)
let actionsElement = $state<HTMLDivElement | null>(null)
let bottomSpacerElement = $state<HTMLDivElement | null>(null)
let viewerTargetHeightPx = $state<number | null>(null)
let overlayContentHeight = $state(0)
let containerScrollable = $state(false)
let latchedViewerTargetHeightPx = $state<number | null>(null)
let viewerBudgetFrame = 0

/**
 * Reconciles per-mode rounding drift between measured stack height and shell budget.
 *
 * @param mode Current feature-card mode.
 * @returns Pixel compensation applied to the computed viewer budget.
 */
function getContributionHeightCompensationPx(mode: FeatureCardMode): number {
  switch (mode) {
    case FeatureCardMode.AddPhoto:
      return 0
    case FeatureCardMode.Missing:
      return 1
    case FeatureCardMode.New:
      return 2
    default:
      return 0
  }
}

/**
 * Measures layout height without animation transforms so card-open FLIP motion
 * cannot shrink the viewer budget inputs.
 *
 * @param element Element whose layout height should be read.
 * @returns Stable layout height in pixels.
 */
function measureElementHeight(element: HTMLElement | null | undefined): number {
  return element?.offsetHeight ?? 0
}

/**
 * Coalesces budget recalculation into a single paint-aligned pass.
 */
function scheduleViewerBudgetUpdate(): void {
  if (viewerBudgetFrame) return

  viewerBudgetFrame = requestAnimationFrame(() => {
    viewerBudgetFrame = 0
    updateViewerBudget()
  })
}

/**
 * Measures the internal stack and updates the viewer height target.
 */
function updateViewerBudget(): void {
  const viewportElement = viewport
  const viewerShell = viewerShellElement
  const contentShell = contentShellElement
  const shouldMeasureDisplayChrome =
    cardCtx.isDisplayMode || cardCtx.isSubmissionSuccessMode

  // Standard content routes text around the portal after measuring its width.
  // Hold the outgoing gallery until that real layout replaces the placeholder.
  if (shouldMeasureDisplayChrome && cardType === 'standard' && !contentLayoutReady)
    return

  if (!viewportElement || !viewerShell || !contentShell) {
    // Retain the last committed geometry while the next body is mounting.
    return
  }

  if (
    shouldMeasureDisplayChrome &&
    !isPortalBand &&
    (!breadcrumbsElement || !titleElement)
  ) {
    // Retain the last committed geometry while the next body is mounting.
    return
  }

  const actionsHeight = measureElementHeight(actionsElement)
  const bottomSpacerHeight = measureElementHeight(bottomSpacerElement)
  const breadcrumbsHeight = measureElementHeight(breadcrumbsElement)
  const titleHeight = measureElementHeight(titleElement)
  // Only share the portal row when the actual rendered title and trailing controls
  // fit in its left-hand slot. Badges and expanded descriptions keep a full row.
  const titleText = titleElement?.querySelector<HTMLElement>(
    '.bits-scrollable-text__content',
  )
  const titleRow = titleElement?.firstElementChild as HTMLElement | null
  const titleControls = titleRow?.lastElementChild as HTMLElement | null
  const titleStyle = titleRow ? getComputedStyle(titleRow) : null
  const naturalTitleWidth =
    titleText && titleStyle
      ? titleText.scrollWidth +
        (titleControls?.offsetWidth ?? 0) +
        Number.parseFloat(titleStyle.paddingLeft) +
        Number.parseFloat(titleStyle.paddingRight) +
        8
      : Number.POSITIVE_INFINITY
  const nextTitleOverlapPx =
    cardType === 'standard' &&
    cardCtx.isDisplayMode &&
    responsiveWidth < 768 &&
    !isDescriptionExpanded &&
    titleHeight <= 30 &&
    naturalTitleWidth <= titleSpaceWidthPx
      ? titleHeight
      : 0
  if (titleOverlapPx !== nextTitleOverlapPx) {
    // Prepare text/field routing before committing the visible title and gallery
    // geometry together; otherwise the margin jumps ahead of the gallery.
    titleOverlapPx = nextTitleOverlapPx
    scheduleViewerBudgetUpdate()
    return
  }
  const contentHeight = measureElementHeight(contentShell)
  const staticHeight =
    breadcrumbsHeight +
    titleHeight -
    nextTitleOverlapPx +
    contentHeight +
    actionsHeight +
    bottomSpacerHeight
  const shellElement = document.getElementById('feature-card-shell')
  const shellStyle = shellElement ? getComputedStyle(shellElement) : null
  const chromeBorderHeight = shellStyle
    ? (Number.parseFloat(shellStyle.borderTopWidth) || 0) +
      (Number.parseFloat(shellStyle.borderBottomWidth) || 0)
    : layout.chromeBorderWidthPx * 2
  // Contribution modes do not all round the same way, so reconcile the final
  // viewer budget against the observed per-mode drift.
  const contributionHeightCompensationPx = shouldMeasureDisplayChrome
    ? 0
    : getContributionHeightCompensationPx(mode)
  const availableHeight =
    layout.heightBudgetPx -
    staticHeight -
    chromeBorderHeight +
    contributionHeightCompensationPx
  // Require consecutive matching measurements so an intermediate body layout
  // cannot start an animation that reverses on the following frame.
  const budgetKey = [
    feature.id,
    mode,
    availableHeight,
    nextTitleOverlapPx,
    overlayContentHeight,
    preferredViewerMinHeightPx,
    isDescriptionExpanded,
  ].join(':')
  if (pendingViewerBudgetKey !== budgetKey) {
    pendingViewerBudgetKey = budgetKey
    scheduleViewerBudgetUpdate()
    return
  }
  // Absorb a small height deficit in the photo instead of creating a nearly
  // motionless scrollbar. Keep larger overflow scrollable and sharing intact.
  const canRelaxPhotoMinimum = cardCtx.isDisplayMode && !cardCtx.shareTarget
  if (!canRelaxPhotoMinimum) {
    viewerFitReductionPx = 0
  } else if (!isDescriptionExpanded) {
    const deficit =
      preferredViewerMinHeightPx +
      layout.viewerTopPaddingPx +
      layout.viewerPaddingPx -
      availableHeight
    viewerFitReductionPx = deficit > 0 && deficit <= 16 ? deficit : 0
  }
  // Sharing and attribution may need more room than photos; let the body flow below its intrinsic height.
  const viewerBlockMinHeightPx =
    Math.max(viewerMinHeightPx, overlayContentHeight) +
    layout.viewerTopPaddingPx +
    layout.viewerPaddingPx
  // Compact cards may already overflow before expansion and never latch a height.
  // Use the viewer's minimum in that case so the expanded text still enables scrolling.
  const resolvedViewerTargetHeightPx = isDescriptionExpanded
    ? Math.max(
        latchedViewerTargetHeightPx ?? viewerBlockMinHeightPx,
        viewerBlockMinHeightPx,
      )
    : availableHeight

  // Preserve the last collapsed viewer budget so description expansion cannot
  // steal height back from the viewer once the user opens the full text.
  if (!isDescriptionExpanded && availableHeight >= viewerBlockMinHeightPx) {
    latchedViewerTargetHeightPx = availableHeight
  }

  const collapsedScrollable = availableHeight < viewerBlockMinHeightPx
  const expandedScrollable =
    staticHeight + resolvedViewerTargetHeightPx + chromeBorderHeight >
    layout.heightBudgetPx
  const shouldScrollContainer = isDescriptionExpanded
    ? expandedScrollable
    : collapsedScrollable

  containerScrollable = shouldScrollContainer
  committedTitleOverlapPx = nextTitleOverlapPx
  viewerTargetHeightPx =
    !isDescriptionExpanded && collapsedScrollable
      ? viewerBlockMinHeightPx
      : resolvedViewerTargetHeightPx
}

/**
 * Stores whether the description is expanded so the content layout can react.
 *
 * @param expanded Current description expansion state.
 */
function handleDescriptionToggle(expanded: boolean): void {
  isDescriptionExpanded = expanded

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('FeatureCard.descriptionExpandedChange', {
        detail: { expanded },
      }),
    )
  }
}

function handleRootContentVisibilityChange(visible: boolean): void {
  if (!visible) return

  scheduleViewerBudgetUpdate()

  requestAnimationFrame(() => {
    scheduleViewerBudgetUpdate()

    requestAnimationFrame(() => {
      scheduleViewerBudgetUpdate()
    })
  })
}

// Cache refreshes can replace the feature object while the same card stays open.
// Reset expansion only when navigating to a different feature identity.
const featureId = $derived(feature.id)
$effect(() => {
  featureId
  isDescriptionExpanded = false
  latchedViewerTargetHeightPx = null
})

$effect(() => {
  const currentLayout = layout
  viewerMinHeightPx
  titleSpaceWidthPx
  contentLayoutReady
  overlayContentHeight
  isPortalBand
  const viewportElement = viewport
  const contentShell = contentShellElement
  const shouldMeasureDisplayChrome =
    cardCtx.isDisplayMode || cardCtx.isSubmissionSuccessMode

  void currentLayout

  if (!viewportElement || !viewerShellElement || !contentShell) {
    // Retain the last committed geometry while the next body is mounting.
    return
  }

  if (
    shouldMeasureDisplayChrome &&
    !isPortalBand &&
    (!breadcrumbsElement || !titleElement)
  ) {
    // Retain the last committed geometry while the next body is mounting.
    return
  }

  // Batch mount and ResizeObserver updates so the card only measures once per frame.
  const observer = new ResizeObserver(() => {
    scheduleViewerBudgetUpdate()
  })

  observer.observe(viewportElement)
  observer.observe(contentShell)
  if (breadcrumbsElement) observer.observe(breadcrumbsElement)
  if (titleElement) observer.observe(titleElement)
  const measuredTitle = titleElement?.querySelector('.bits-scrollable-text__content')
  if (measuredTitle) observer.observe(measuredTitle)
  if (validationElement) observer.observe(validationElement)
  if (actionsElement) observer.observe(actionsElement)
  if (bottomSpacerElement) observer.observe(bottomSpacerElement)

  // Re-run when any layout token changes, even if the observer targets keep the
  // same box metrics across the breakpoint transition.
  scheduleViewerBudgetUpdate()

  return () => {
    observer.disconnect()
    if (viewerBudgetFrame) {
      cancelAnimationFrame(viewerBudgetFrame)
      viewerBudgetFrame = 0
    }
  }
})
</script>

<FeatureCardRoot onContentVisibilityChange={handleRootContentVisibilityChange}>
  <div class="group/feature-card pointer-events-none flex min-h-0 flex-1 flex-col">
    <FeatureCardContainer bind:viewport scrollable={containerScrollable}>
      <div
        bind:this={viewerShellElement}
        bind:clientWidth={cardContentWidth}
        style={isPortalBand
          ? `mask-image: radial-gradient(circle at calc(100% - ${bandPortalSize / 2 + 12}px) calc(100% + ${bandPortalCenterY}px), transparent ${bandPortalSize * 0.48}px, black ${bandPortalSize * 0.48 + 0.5}px);`
          : undefined}
        class="pointer-events-none flex min-h-0 w-full shrink-0 flex-col items-stretch"
      >
        <FeatureCardViewerContent
          showImagePips={isPortalBand}
          scrollable={containerScrollable}
          minHeightPx={viewerMinHeightPx}
          paddingPx={layout.viewerPaddingPx}
          topPaddingPx={layout.viewerTopPaddingPx}
          targetHeightPx={viewerTargetHeightPx}
          onOverlayHeightChange={height => {
            overlayContentHeight = height
          }}
        />
      </div>
      <div
        class={containerScrollable
          ? 'pointer-events-none flex shrink-0 flex-col'
          : 'pointer-events-none flex min-h-0 shrink-0 flex-col'}
      >
        {#if isPortalBand}
          <div bind:this={contentShellElement} bind:clientHeight={portalBandHeight}>
            <FeatureCardPortalBand
              {feature}
              portalSize={bandPortalSize}
              portalCenterY={bandPortalCenterY}
            />
          </div>
        {:else if cardCtx.isDisplayMode || cardCtx.isSubmissionSuccessMode}
          <div bind:this={breadcrumbsElement}>
            <FeatureCardBreadcrumbs {feature} showShare={!cardCtx.isDisplayMode} />
          </div>
          <div
            bind:this={titleElement}
            class="relative z-40 transition-[margin-bottom] motion-reduce:transition-none"
            style={`transition-duration: ${VIEWER_TRANSITION_MS}ms; transition-timing-function: ${VIEWER_TRANSITION_EASING}; margin-bottom: -${committedTitleOverlapPx}px; ${titleOverlapPx > 0 ? `width: ${titleSpaceWidthPx}px;` : ''}`}
          >
            <FeatureCardTitle {feature} />
            <!-- The title narrows before its shared-row spacing finishes moving.
                 Fill the full-width strip above the incoming portal throughout
                 that motion, with 1px of overlap to cover fractional rounding
                 without painting over the circular map opening. -->
            <div
              aria-hidden="true"
              data-feature-card-title-surface
              class="pointer-events-none absolute top-0 left-0 -z-10 bg-(--theme-panel) transition-[height] motion-reduce:transition-none"
              style={`width: ${cardContentWidth}px; height: calc(100% - ${committedTitleOverlapPx}px + 1px); transition-duration: ${VIEWER_TRANSITION_MS}ms; transition-timing-function: ${VIEWER_TRANSITION_EASING};`}
            ></div>
          </div>
          <div bind:this={contentShellElement}>
            {#if cardType === 'breadline'}
              <BreadlineCardContent {feature} run={breadlineRun} />
            {:else}
              <FeatureCardContent
                {feature}
                titleInsetPx={titleOverlapPx}
                onTitleSpaceChange={width => {
                  titleSpaceWidthPx = width
                }}
                onLayoutReadyChange={ready => {
                  contentLayoutReady = ready
                }}
                expanded={isDescriptionExpanded}
                onToggle={handleDescriptionToggle}
              />
            {/if}
          </div>
        {:else if viewport}
          <div bind:this={contentShellElement}>
            {#if cardCtx.isMissingMode}
              <FeatureCardMissingReportBody {viewport} />
            {:else if cardCtx.isAddPhotoMode}
              <FeatureCardAddPhotoBody {viewport} />
            {/if}
          </div>
        {/if}
      </div>
    </FeatureCardContainer>
    <div bind:this={actionsElement}>
      <FeatureCardActions
        centerRightActionsOnMobile={mode !== FeatureCardMode.Display}
        leftActionsFillAvailableWidth={mode === FeatureCardMode.Display}
      >
        {#snippet topActions()}
          {#if cardType === 'breadline' &&
            mode === FeatureCardMode.Display &&
            feature.organisationId}
            <OrganisationOnboarding organisationId={feature.organisationId} />
          {/if}
          {#if mode !== FeatureCardMode.Display}
            <div bind:this={validationElement} class="min-w-0">
              <FeatureCardNewPrimitive.ValidationError />
            </div>
          {/if}
        {/snippet}
        {#snippet leftActions()}
          {#if mode === FeatureCardMode.Display}
            <div class="flex min-w-0 flex-1 items-center gap-1">
              <FeatureCardActionPrimitive.WishlistAction
                {feature}
                isIconOnly={isFeatureActionIconOnly}
              />
              <FeatureCardActionPrimitive.VisitAction
                {feature}
                isIconOnly={isFeatureActionIconOnly}
              />
            </div>
          {/if}
        {/snippet}
        {#snippet rightActions()}
          {#if mode === FeatureCardMode.Display}
            <div class={isFeatureActionIconOnly ? '' : 'mr-1'}>
              <FeatureCardShareAction {feature} isIconOnly={isFeatureActionIconOnly} />
            </div>
            <FeatureCardActionPrimitive.DirectionsAction
              {feature}
              isIconOnly={isFeatureActionIconOnly}
            />
          {:else if mode === FeatureCardMode.New}
            <FeatureCardActionPrimitive.SubmitNewFeatureAction />
          {:else if mode === FeatureCardMode.Missing}
            <div class="flex w-full justify-center">
              <FeatureCardActionPrimitive.SubmitMissingReportAction {feature} />
            </div>
          {:else if mode === FeatureCardMode.AddPhoto}
            <FeatureCardActionPrimitive.SubmitNewPhotosAction {feature} />
          {/if}
        {/snippet}
      </FeatureCardActions>
    </div>
    {#if layout.bottomSpacerPx > 0}
      <div
        bind:this={bottomSpacerElement}
        aria-hidden="true"
        class="shrink-0 bg-(--theme-panel)"
        style={`height: ${layout.bottomSpacerPx}px;`}
      ></div>
    {/if}
  </div>
</FeatureCardRoot>
