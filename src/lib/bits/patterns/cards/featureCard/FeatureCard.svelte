<script lang="ts">
// BITS
import FeatureCardAddPhotoBody from './components/FeatureCardAddPhotoBody.svelte'
import FeatureCardActions from './components/FeatureCardActions.svelte'
import FeatureCardBreadcrumbs from './components/FeatureCardBreadcrumbs.svelte'
import FeatureCardContainer from './components/FeatureCardContainer.svelte'
import FeatureCardContent from './components/FeatureCardContent.svelte'
import FeatureCardMissingReportBody from './components/FeatureCardMissingReportBody.svelte'
import FeatureCardRoot from './components/FeatureCardRoot.svelte'
import FeatureCardTitle from './components/FeatureCardTitle.svelte'
import FeatureCardViewerContent from './components/FeatureCardViewerContent.svelte'
import * as FeatureCardActionPrimitive from './components/actions'
import ValidationError from '$lib/components/featureCard/ValidationError.svelte'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx, setResponsiveCtx } from '$lib/context/responsive.svelte'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// TYPES
import type { Feature } from '$lib/db/zod/schema/feature.types'
// LOCAL
import { getFeatureCardLayout } from './featureCard.layout'
import { getFeatureCardResponsiveWidth } from './featureCard.utils'

type FeatureCardProps = {
  feature: Feature
}

let { feature }: FeatureCardProps = $props()

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
const mode = $derived(cardCtx.state.mode)
const responsiveWidth = $derived(getFeatureCardResponsiveWidth(responsiveCtx))
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
    responsiveWidth,
  }),
)

let viewport = $state<HTMLElement>()
let isDescriptionExpanded = $state(false)
let showDescriptionToggle = $state(false)
let viewerShellElement = $state<HTMLDivElement | null>(null)
let breadcrumbsElement = $state<HTMLDivElement | null>(null)
let titleElement = $state<HTMLDivElement | null>(null)
let contentShellElement = $state<HTMLDivElement | null>(null)
let validationElement = $state<HTMLDivElement | null>(null)
let actionsElement = $state<HTMLDivElement | null>(null)
let bottomSpacerElement = $state<HTMLDivElement | null>(null)
let viewerTargetHeightPx = $state<number | null>(null)
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

  if (!viewportElement || !viewerShell || !contentShell) {
    containerScrollable = false
    viewerTargetHeightPx = null
    return
  }

  if (shouldMeasureDisplayChrome && (!breadcrumbsElement || !titleElement)) {
    containerScrollable = false
    viewerTargetHeightPx = null
    return
  }

  const actionsHeight = measureElementHeight(actionsElement)
  const bottomSpacerHeight = measureElementHeight(bottomSpacerElement)
  const breadcrumbsHeight = measureElementHeight(breadcrumbsElement)
  const titleHeight = measureElementHeight(titleElement)
  const contentHeight = measureElementHeight(contentShell)
  const staticHeight =
    breadcrumbsHeight + titleHeight + contentHeight + actionsHeight + bottomSpacerHeight
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
  const viewerBlockMinHeightPx =
    layout.viewerMinHeightPx + layout.viewerTopPaddingPx + layout.viewerPaddingPx
  const resolvedViewerTargetHeightPx = isDescriptionExpanded
    ? latchedViewerTargetHeightPx
    : availableHeight

  // Preserve the last collapsed viewer budget so description expansion cannot
  // steal height back from the viewer once the user opens the full text.
  if (!isDescriptionExpanded && availableHeight >= viewerBlockMinHeightPx) {
    latchedViewerTargetHeightPx = availableHeight
  }

  const collapsedScrollable = availableHeight < viewerBlockMinHeightPx
  const expandedScrollable =
    resolvedViewerTargetHeightPx !== null &&
    staticHeight + resolvedViewerTargetHeightPx + chromeBorderHeight >
      layout.heightBudgetPx
  const shouldScrollContainer = isDescriptionExpanded
    ? expandedScrollable
    : collapsedScrollable

  containerScrollable = shouldScrollContainer
  viewerTargetHeightPx =
    !isDescriptionExpanded && collapsedScrollable ? null : resolvedViewerTargetHeightPx
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

/**
 * Mirrors whether the content layout currently requires a description toggle.
 *
 * @param visible Whether the toggle should be shown.
 */
function handleDescriptionToggleVisibility(visible: boolean): void {
  showDescriptionToggle = visible
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

$effect(() => {
  feature.id
  isDescriptionExpanded = false
  latchedViewerTargetHeightPx = null
})

$effect(() => {
  const currentLayout = layout
  const viewportElement = viewport
  const contentShell = contentShellElement
  const shouldMeasureDisplayChrome =
    cardCtx.isDisplayMode || cardCtx.isSubmissionSuccessMode

  void currentLayout

  if (!viewportElement || !viewerShellElement || !contentShell) {
    containerScrollable = false
    viewerTargetHeightPx = null
    return
  }

  if (shouldMeasureDisplayChrome && (!breadcrumbsElement || !titleElement)) {
    containerScrollable = false
    viewerTargetHeightPx = null
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
  <div class="pointer-events-none flex min-h-0 flex-1 flex-col">
    <FeatureCardContainer bind:viewport scrollable={containerScrollable}>
      <div
        bind:this={viewerShellElement}
        class="pointer-events-none flex min-h-0 w-full shrink-0 flex-col items-stretch"
      >
        <FeatureCardViewerContent
          scrollable={containerScrollable}
          minHeightPx={layout.viewerMinHeightPx}
          paddingPx={layout.viewerPaddingPx}
          topPaddingPx={layout.viewerTopPaddingPx}
          targetHeightPx={viewerTargetHeightPx}
        />
      </div>
      <div
        class={containerScrollable
          ? 'pointer-events-none flex shrink-0 flex-col'
          : 'pointer-events-none flex min-h-0 shrink-0 flex-col'}
      >
        {#if cardCtx.isDisplayMode || cardCtx.isSubmissionSuccessMode}
          <div bind:this={breadcrumbsElement}><FeatureCardBreadcrumbs {feature} /></div>
          <div bind:this={titleElement}>
            <FeatureCardTitle
              {feature}
              expanded={isDescriptionExpanded}
              {showDescriptionToggle}
              onToggleDescription={handleDescriptionToggle}
            />
          </div>
          <div bind:this={contentShellElement}>
            <FeatureCardContent
              {feature}
              expanded={isDescriptionExpanded}
              onToggle={handleDescriptionToggle}
              onToggleVisibility={handleDescriptionToggleVisibility}
            />
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
      <FeatureCardActions centerRightActionsOnMobile={mode !== FeatureCardMode.Display}>
        {#snippet topActions()}
          {#if mode !== FeatureCardMode.Display}
            <div bind:this={validationElement} class="min-w-0"><ValidationError /></div>
          {/if}
        {/snippet}
        {#snippet leftActions()}
          {#if mode === FeatureCardMode.Display}
            <div class="flex items-center gap-2">
              <FeatureCardActionPrimitive.WishlistAction {feature} />
              <FeatureCardActionPrimitive.VisitAction {feature} />
            </div>
          {/if}
        {/snippet}
        {#snippet rightActions()}
          {#if mode === FeatureCardMode.Display}
            <FeatureCardActionPrimitive.DirectionsAction {feature} />
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
        class="shrink-0 bg-black"
        style={`height: ${layout.bottomSpacerPx}px;`}
      ></div>
    {/if}
  </div>
</FeatureCardRoot>
