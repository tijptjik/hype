<script lang="ts">
// BITS
import FeatureCardActions from './components/FeatureCardActions.svelte'
import FeatureCardBreadcrumbs from './components/FeatureCardBreadcrumbs.svelte'
import FeatureCardContainer from './components/FeatureCardContainer.svelte'
import FeatureCardContent from './components/FeatureCardContent.svelte'
import FeatureCardRoot from './components/FeatureCardRoot.svelte'
import FeatureCardTitle from './components/FeatureCardTitle.svelte'
import FeatureCardViewerContent from './components/FeatureCardViewerContent.svelte'
import * as FeatureCardActionPrimitive from './components/actions'
// COMPONENTS
import AddPhotoBody from '$lib/components/featureCard/AddPhotoBody.svelte'
import MissingReportBody from '$lib/components/featureCard/MissingReportBody.svelte'
import ValidationError from '$lib/components/featureCard/ValidationError.svelte'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
import { getResponsiveCtx, setResponsiveCtx } from '$lib/context/responsive.svelte'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// TYPES
import type { Feature } from '$lib/db/zod/schema/feature.types'
// LOCAL
import { getFeatureCardLayout } from './featureCard.layout'

type FeatureCardProps = {
  feature: Feature
}

let { feature }: FeatureCardProps = $props()

const cardCtx = getCardCtx()
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
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
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
  const breadcrumbsShell = breadcrumbsElement
  const titleShell = titleElement
  const contentShell = contentShellElement

  if (
    !viewportElement ||
    !viewerShell ||
    !breadcrumbsShell ||
    !titleShell ||
    !contentShell
  ) {
    containerScrollable = false
    viewerTargetHeightPx = null
    return
  }

  const measureElementHeight = (element: HTMLElement | null | undefined): number =>
    element ? element.getBoundingClientRect().height : 0

  const validationHeight = measureElementHeight(validationElement)
  const actionsHeight = measureElementHeight(actionsElement)
  const bottomSpacerHeight = measureElementHeight(bottomSpacerElement)
  const breadcrumbsHeight = measureElementHeight(breadcrumbsShell)
  const titleHeight = measureElementHeight(titleShell)
  const contentHeight = measureElementHeight(contentShell)
  const staticHeight =
    breadcrumbsHeight +
    titleHeight +
    contentHeight +
    validationHeight +
    actionsHeight +
    bottomSpacerHeight
  const shellElement = document.getElementById('feature-card-shell')
  const shellStyle = shellElement ? getComputedStyle(shellElement) : null
  const chromeBorderHeight = shellStyle
    ? (Number.parseFloat(shellStyle.borderTopWidth) || 0) +
      (Number.parseFloat(shellStyle.borderBottomWidth) || 0)
    : layout.chromeBorderWidthPx * 2
  const availableHeight = layout.heightBudgetPx - staticHeight - chromeBorderHeight
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

$effect(() => {
  feature.id
  isDescriptionExpanded = false
  latchedViewerTargetHeightPx = null
})

$effect(() => {
  const currentLayout = layout
  const viewportElement = viewport
  const viewerShell = viewerShellElement
  const breadcrumbsShell = breadcrumbsElement
  const titleShell = titleElement
  const contentShell = contentShellElement

  void currentLayout

  if (
    !viewportElement ||
    !viewerShell ||
    !breadcrumbsShell ||
    !titleShell ||
    !contentShell
  ) {
    containerScrollable = false
    viewerTargetHeightPx = null
    return
  }

  // Batch mount and ResizeObserver updates so the card only measures once per frame.
  const observer = new ResizeObserver(() => {
    scheduleViewerBudgetUpdate()
  })

  observer.observe(viewportElement)
  observer.observe(viewerShell)
  observer.observe(breadcrumbsShell)
  observer.observe(titleShell)
  observer.observe(contentShell)
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

<FeatureCardRoot>
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
        {:else if cardCtx.isMissingMode && viewport}
          <MissingReportBody {viewport} />
        {:else if cardCtx.isAddPhotoMode && viewport}
          <AddPhotoBody {viewport} />
        {/if}
      </div>
    </FeatureCardContainer>
    <div bind:this={validationElement}><ValidationError /></div>
    <div bind:this={actionsElement}>
      <FeatureCardActions>
        {#snippet leftActions()}
          {#if mode === FeatureCardMode.Display}
            <div class="flex items-center gap-2">
              <FeatureCardActionPrimitive.WishlistAction {feature} />
              <FeatureCardActionPrimitive.VisitAction {feature} />
            </div>
          {:else if mode === FeatureCardMode.New}
            <FeatureCardActionPrimitive.FeatureCardActionLabelPrimitive.NewFeatureLabel />
          {:else if mode === FeatureCardMode.Missing}
            <FeatureCardActionPrimitive.FeatureCardActionLabelPrimitive.MissingReportLabel />
          {:else if mode === FeatureCardMode.AddPhoto}
            <FeatureCardActionPrimitive.FeatureCardActionLabelPrimitive.AddPhotoLabel />
          {/if}
        {/snippet}
        {#snippet rightActions()}
          {#if mode === FeatureCardMode.Display}
            <FeatureCardActionPrimitive.DirectionsAction {feature} />
          {:else if mode === FeatureCardMode.New}
            <FeatureCardActionPrimitive.SubmitNewFeatureAction />
          {:else if mode === FeatureCardMode.Missing}
            <FeatureCardActionPrimitive.SubmitMissingReportAction {feature} />
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
